#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/../../.." && pwd)
cd "$REPO_ROOT"
secrets=${PIAGENT_SECRET_DIR:-/home/kiwi/OracleDBHarness/databases/secrets}
wallet_dir=/home/kiwi/OracleDBHarness/databases/wallets/c1-tcps
container=oracle19c-cdb
host_ip=$(docker inspect -f '{{.NetworkSettings.Networks.bridge.IPAddress}}' "$container")
[[ -n "$host_ip" ]] || { echo 'Cannot determine C1 bridge IP' >&2; exit 1; }
export PIAGENT_C1_TCPS_HOST="$host_ip"
[[ -r "$secrets/c1_tcps_wallet.pw" && -r "$secrets/c1_piagent_ro.pw" && -r "$secrets/c1_sys.pw" ]] || { echo 'C1 TCPS or verification secret missing' >&2; exit 1; }
[[ -r "$wallet_dir/ewallet.pem" && -r "$wallet_dir/tnsnames.ora" ]] || { echo 'C1 TCPS wallet files missing' >&2; exit 1; }

tmp=$(mktemp -d)
chmod 700 "$tmp"
export PIAGENT_TCPS_TMP="$tmp"
cleanup() {
	status=$?
	python3 - "$tmp" <<'PY'
import shutil,sys
shutil.rmtree(sys.argv[1],ignore_errors=True)
PY
	return "$status"
}
trap cleanup EXIT

main_status=$(docker exec -u oracle "$container" bash -lc 'lsnrctl status LISTENER')
grep -q 'PORT=1521' <<<"$main_status"
if grep -q 'PORT=2484' <<<"$main_status"; then echo 'TCPS endpoint unexpectedly appeared on main LISTENER' >&2; exit 1; fi
tcps_status=$(docker exec -u oracle "$container" bash -lc 'lsnrctl status LISTENER_TCPS')
grep -qi 'PORT=2484' <<<"$tcps_status"
grep -qi 'Service "pipdb1"' <<<"$tcps_status"

# Extract temporary PEM components privately to verify mutual TLS with OpenSSL.
PIAGENT_SECRET_DIR="$secrets" PIAGENT_C1_TCPS_HOST="$host_ip" python3 - <<'PY'
import os,pathlib,re,subprocess
root=pathlib.Path(os.environ['PIAGENT_TCPS_TMP'])
wallet=pathlib.Path('/home/kiwi/OracleDBHarness/databases/wallets/c1-tcps/ewallet.pem').read_text()
key=re.search(r'-----BEGIN ENCRYPTED PRIVATE KEY-----.*?-----END ENCRYPTED PRIVATE KEY-----\s*',wallet,re.S).group(0)
certs=re.findall(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----\s*',wallet,re.S)
if len(certs)<2: raise SystemExit('Client wallet certificate chain is incomplete')
for name,data in [('client.key',key),('client.pem',certs[0]),('ca.pem',certs[1])]:
 path=root/name; path.write_text(data); path.chmod(0o600)
result=subprocess.run(['openssl','s_client','-connect',os.environ['PIAGENT_C1_TCPS_HOST']+':2484','-cert',str(root/'client.pem'),'-key',str(root/'client.key'),'-pass',f'file:{os.environ["PIAGENT_SECRET_DIR"]}/c1_tcps_wallet.pw','-CAfile',str(root/'ca.pem'),'-verify_return_error','-brief'],input=b'',stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=20)
output=result.stdout.decode(errors='replace')
if result.returncode or 'CONNECTION ESTABLISHED' not in output or 'Verification: OK' not in output: raise SystemExit('OpenSSL TCPS mTLS handshake failed')
print('OpenSSL mTLS handshake verified.')
PY

PIAGENT_SECRET_DIR="$secrets" node --input-type=module <<'NODE'
import fs from 'node:fs';
import oracledb from 'oracledb';
const dir='/home/kiwi/OracleDBHarness/databases/wallets/c1-tcps', secrets=process.env.PIAGENT_SECRET_DIR;
const connection=await oracledb.getConnection({user:'PIAGENT_RO',password:fs.readFileSync(`${secrets}/c1_piagent_ro.pw`,'utf8').trim(),connectString:'pipdb1_tcps',configDir:dir,walletLocation:dir,walletPassword:fs.readFileSync(`${secrets}/c1_tcps_wallet.pw`,'utf8').trim()});
try {
 const r=await connection.execute("SELECT SYS_CONTEXT('USERENV','CON_NAME'), SYS_CONTEXT('USERENV','NETWORK_PROTOCOL'), (SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%') FROM dual",[],{outFormat:oracledb.OUT_FORMAT_ARRAY});
 const [pdb,protocol,version]=r.rows[0];
 if(pdb!=='PIPDB1'||String(protocol).toLowerCase()!=='tcps'||!String(version).startsWith('19.')) throw new Error('C1 TCPS identity/version/protocol verification failed');
 console.log('Thin-mode TCPS connection verified: PIPDB1, Oracle 19c, TCPS.');
} finally { await connection.close(); }
NODE

PIAGENT_C1_TCPS_HOST="$host_ip" PIAGENT_SECRET_DIR="$secrets" node --input-type=module <<'NODE'
import fs from 'node:fs'; import oracledb from 'oracledb';
const password=fs.readFileSync(`${process.env.PIAGENT_SECRET_DIR}/c1_piagent_ro.pw`,'utf8').trim();
const c=await oracledb.getConnection({user:'PIAGENT_RO',password,connectString:`${process.env.PIAGENT_C1_TCPS_HOST}:1521/PIPDB1`});
try { const r=await c.execute("SELECT SYS_CONTEXT('USERENV','CON_NAME') FROM dual",[],{outFormat:oracledb.OUT_FORMAT_ARRAY}); if(r.rows[0][0]!=='PIPDB1') throw new Error('Existing TCP PIPDB1 connection failed'); console.log('Existing TCP 1521 PIPDB1 connection verified.'); } finally { await c.close(); }
NODE

# Read SYS password only through stdin; node code receives no credential in argv.
cat "$secrets/c1_sys.pw" | node --input-type=module -e '
import oracledb from "oracledb";
const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk);
const password=Buffer.concat(chunks).toString("utf8").trim();
const c=await oracledb.getConnection({user:"SYS",password,connectString:`${process.env.PIAGENT_C1_TCPS_HOST}:1521/PIPDB1`,privilege:oracledb.SYSDBA});
try { const r=await c.execute("SELECT status,error FROM v$archive_dest_status WHERE dest_id=2",[],{outFormat:oracledb.OUT_FORMAT_ARRAY}); if(r.rows[0]?.[0]!=="VALID"||r.rows[0]?.[1]) throw new Error("C1 Data Guard destination 2 is not VALID"); console.log("C1 Data Guard destination 2 is VALID with no error."); } finally { await c.close(); }
'
