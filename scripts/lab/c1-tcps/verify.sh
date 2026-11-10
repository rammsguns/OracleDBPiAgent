#!/usr/bin/env bash
set -euo pipefail
secrets=${PIAGENT_SECRET_DIR:-/home/kiwi/OracleDBHarness/databases/secrets}
wallet_dir=/home/kiwi/OracleDBHarness/databases/wallets/c1-tcps
container=oracle19c-cdb

[[ -r "$secrets/c1_tcps_wallet.pw" && -r "$secrets/c1_piagent_ro.pw" ]] || { echo 'C1 TCPS or PIAGENT_RO secret missing' >&2; exit 1; }
[[ -r "$wallet_dir/ewallet.pem" && -r "$wallet_dir/tnsnames.ora" ]] || { echo 'C1 TCPS wallet files missing' >&2; exit 1; }

main_status=$(docker exec -u oracle "$container" bash -lc 'lsnrctl status LISTENER')
grep -q 'PORT=1521' <<<"$main_status"
if grep -q 'PORT=2484' <<<"$main_status"; then echo 'TCPS endpoint unexpectedly appeared on main LISTENER' >&2; exit 1; fi
tcps_status=$(docker exec -u oracle "$container" bash -lc 'lsnrctl status LISTENER_TCPS')
grep -qi 'PORT=2484' <<<"$tcps_status"
grep -qi 'Service "pipdb1"' <<<"$tcps_status"

# Prove mutual TLS handshake using the encrypted client key in ewallet.pem.
PIAGENT_SECRET_DIR="$secrets" python3 - <<'PY'
import os,pathlib,re,subprocess,tempfile
wallet=pathlib.Path('/home/kiwi/OracleDBHarness/databases/wallets/c1-tcps/ewallet.pem').read_text()
key=re.search(r'-----BEGIN ENCRYPTED PRIVATE KEY-----.*?-----END ENCRYPTED PRIVATE KEY-----\s*',wallet,re.S).group(0)
certs=re.findall(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----\s*',wallet,re.S)
if len(certs)<2: raise SystemExit('Client wallet certificate chain is incomplete')
with tempfile.TemporaryDirectory(prefix='c1-tcps-verify-') as directory:
 os.chmod(directory,0o700); root=pathlib.Path(directory)
 for name,data in [('client.key',key),('client.pem',certs[0]),('ca.pem',certs[1])]:
  path=root/name; path.write_text(data); path.chmod(0o600)
 result=subprocess.run(['openssl','s_client','-connect','172.17.0.6:2484','-cert',str(root/'client.pem'),'-key',str(root/'client.key'),'-pass',f'file:{os.environ["PIAGENT_SECRET_DIR"]}/c1_tcps_wallet.pw','-CAfile',str(root/'ca.pem'),'-verify_return_error','-brief'],input=b'',stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=20)
 output=result.stdout.decode(errors='replace')
 if result.returncode or 'CONNECTION ESTABLISHED' not in output or 'Verification: OK' not in output:
  raise SystemExit('OpenSSL TCPS mTLS handshake failed')
 print('OpenSSL mTLS handshake verified.')
PY

PIAGENT_SECRET_DIR="$secrets" node --input-type=module <<'NODE'
import fs from 'node:fs';
import oracledb from 'oracledb';
const dir = '/home/kiwi/OracleDBHarness/databases/wallets/c1-tcps';
const secrets = process.env.PIAGENT_SECRET_DIR;
const password = fs.readFileSync(`${secrets}/c1_piagent_ro.pw`, 'utf8').trim();
const walletPassword = fs.readFileSync(`${secrets}/c1_tcps_wallet.pw`, 'utf8').trim();
if (!oracledb.thin) throw new Error('Oracle driver is not in Thin mode');
const connection = await oracledb.getConnection({
	user: 'PIAGENT_RO', password, connectString: 'pipdb1_tcps',
	configDir: dir, walletLocation: dir, walletPassword,
});
try {
	const result = await connection.execute("SELECT SYS_CONTEXT('USERENV','CON_NAME'), SYS_CONTEXT('USERENV','NETWORK_PROTOCOL'), (SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle%Database%') FROM dual", [], { outFormat: oracledb.OUT_FORMAT_ARRAY });
	const [container, protocol, version] = result.rows[0];
	if (container !== 'PIPDB1' || String(protocol).toLowerCase() !== 'tcps' || !String(version).startsWith('19.')) throw new Error('C1 TCPS identity/version/protocol verification failed');
	console.log('Thin-mode TCPS connection verified: PIPDB1, Oracle 19c, TCPS.');
} finally { await connection.close(); }
NODE

# Confirm existing TCP service remains reachable and Data Guard transport is active.
PIAGENT_SECRET_DIR="$secrets" node --input-type=module <<'NODE'
import fs from 'node:fs';
import oracledb from 'oracledb';
const password = fs.readFileSync(`${process.env.PIAGENT_SECRET_DIR}/c1_piagent_ro.pw`, 'utf8').trim();
const connection = await oracledb.getConnection({ user: 'PIAGENT_RO', password, connectString: '172.17.0.6:1521/PIPDB1' });
try {
	const result = await connection.execute("SELECT SYS_CONTEXT('USERENV','CON_NAME') FROM dual", [], { outFormat: oracledb.OUT_FORMAT_ARRAY });
	if (result.rows[0][0] !== 'PIPDB1') throw new Error('Existing TCP PIPDB1 connection failed');
	console.log('Existing TCP 1521 PIPDB1 connection verified.');
} finally { await connection.close(); }
NODE

# Read-only SYS check; password is piped on stdin and never placed in argv or output.
sys_script=$(mktemp "$PWD/.c1-dg-verify-XXXXXX.mjs"); chmod 600 "$sys_script"; trap 'python3 -c "from pathlib import Path; Path(\"$sys_script\").unlink(missing_ok=True)"' EXIT
cat > "$sys_script" <<'NODE'
import oracledb from 'oracledb';
const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk);
const password=Buffer.concat(chunks).toString('utf8').trim();
const c=await oracledb.getConnection({user:'SYS',password,connectString:'172.17.0.6:1521/PIPDB1', privilege:oracledb.SYSDBA});
try {
 const r=await c.execute("SELECT status, error FROM v$archive_dest_status WHERE dest_id=2",[],{outFormat:oracledb.OUT_FORMAT_ARRAY});
 if (r.rows[0]?.[0] !== 'VALID' || r.rows[0]?.[1]) throw new Error('C1 Data Guard destination 2 is not VALID');
 console.log('C1 Data Guard destination 2 is VALID with no error.');
} finally { await c.close(); }
NODE
cat "$secrets/c1_sys.pw" | node "$sys_script"
