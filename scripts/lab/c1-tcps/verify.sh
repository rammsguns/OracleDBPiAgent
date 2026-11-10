#!/usr/bin/env bash
set -euo pipefail
secrets=${PIAGENT_SECRET_DIR:-/home/kiwi/OracleDBHarness/databases/secrets}
wallet_dir=/home/kiwi/OracleDBHarness/databases/wallets/c1-tcps
container=oracle19c-cdb

[[ -r "$secrets/c1_tcps_wallet.pw" && -r "$secrets/c1_piagent_ro.pw" ]] || { echo 'C1 TCPS or PIAGENT_RO secret missing' >&2; exit 1; }
[[ -r "$wallet_dir/ewallet.pem" && -r "$wallet_dir/tnsnames.ora" ]] || { echo 'C1 TCPS wallet files missing' >&2; exit 1; }

docker exec -u oracle "$container" bash -lc 'lsnrctl status LISTENER' | grep -qi 'PORT=2484'
docker exec -u oracle "$container" bash -lc 'lsnrctl status LISTENER' | grep -q 'PORT=1521'

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
sys_script=$(mktemp --suffix=.mjs); chmod 600 "$sys_script"; trap 'python3 -c "from pathlib import Path; Path(\"$sys_script\").unlink(missing_ok=True)"' EXIT
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
