#!/usr/bin/env bash
# Only administer the dedicated C1 lab. Never enable shell tracing here.
set +x
set -euo pipefail
cd "$(dirname "$0")/../.."
export PIAGENT_SECRET_DIR="${PIAGENT_SECRET_DIR:-/home/kiwi/OracleDBHarness/databases/secrets}"
python3 - <<'PY'
import os, pathlib, secrets, string, subprocess, sys
statements = []
def print(value): statements.append(value)
passwords = []
root = pathlib.Path(os.environ['PIAGENT_SECRET_DIR'])
root.mkdir(parents=True, exist_ok=True)
print('set echo off verify off feedback off define off\nwhenever sqlerror exit failure rollback\nalter session set container=PIPDB1;')
print("begin if sys_context('USERENV','CON_NAME') <> 'PIPDB1' then raise_application_error(-20000,'Wrong container'); end if; end;\n/")
print("begin execute immediate 'create tablespace SHOP_DATA datafile ''/opt/oracle/oradata/CDB19/PIPDB1/shop_data01.dbf'' size 256M autoextend off'; exception when others then if sqlcode <> -1543 then raise; end if; end;\n/")
for user in ('shopapp', 'piagent_ro'):
    path = root / f'c1_{user}.pw'
    if not path.exists():
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as f:
            f.write(secrets.choice(string.ascii_letters) + ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(23)) + '\n')
    os.chmod(path, 0o600)
    password = path.read_text().strip()
    passwords.append(password)
    if not 22 <= len(password) <= 30 or not password[0].isalpha() or not password.isascii() or not password.isalnum():
        raise SystemExit('Invalid lab password format')
    print(f"declare n number; begin select count(*) into n from dba_users where username=upper('{user}'); if n=0 then execute immediate 'create user {user} identified by \"{password}\" default tablespace SHOP_DATA quota unlimited on SHOP_DATA container=current'; end if; end;\n/")
print(pathlib.Path('lab/c1/seed.sql').read_text())
# Use exactly the maintained template's executable grants, with the approved identifiers.
for line in pathlib.Path('docs/grants-template-pdb.sql').read_text().splitlines():
    if line.startswith('GRANT '):
        print(line.replace('&ro_user', 'PIAGENT_RO').replace('&pdb_name', 'PIPDB1'))
for table in ('CUSTOMERS','PRODUCTS','ORDERS','ORDER_LINES','ORDER_HISTORY'):
    print(f'grant select on SHOPAPP.{table} to PIAGENT_RO container=current;')
print("alter user PIAGENT_RO quota 0 on SHOP_DATA;\nexit success")
result = subprocess.run(['docker','exec','-i','oracle19c-cdb','bash','-lc','export ORACLE_SID=CDB19; sqlplus -s / as sysdba'], input='\n'.join(statements), text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
output = result.stdout
for password in passwords: output = output.replace(password, '[REDACTED]')
sys.stdout.write(output)
sys.exit(result.returncode)
PY
