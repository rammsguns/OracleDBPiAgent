#!/usr/bin/env bash
set +x
set -euo pipefail
cd "$(dirname "$0")/../.."
# OS authentication only; never inspect container environment/passwords.
docker exec -i oracle19c-cdb bash -lc 'export ORACLE_SID=CDB19; sqlplus -s / as sysdba' < lab/c1/scale.sql | sed '/ORACLE_PWD/d'
