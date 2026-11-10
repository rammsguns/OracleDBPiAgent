#!/usr/bin/env bash
set -euo pipefail
container=oracle19c-cdb
secrets=${PIAGENT_SECRET_DIR:-/home/kiwi/OracleDBHarness/databases/secrets}
wallet_dir=/home/kiwi/OracleDBHarness/databases/wallets/c1-tcps
root=/opt/oracle/admin/CDB19/tcps
config=/opt/oracle/oradata/dbconfig/CDB19
host_ip=172.17.0.6
wallet_file="$secrets/c1_tcps_wallet.pw"
[[ -r "$secrets/c1_sys.pw" ]] || { echo 'Missing C1 SYS secret file' >&2; exit 1; }
docker inspect "$container" >/dev/null
mkdir -p "$(dirname "$wallet_dir")" "$wallet_dir"
chmod 700 "$(dirname "$wallet_dir")" "$wallet_dir"
tmp=$(mktemp -d); chmod 700 "$tmp"
trap 'rm -rf "$tmp"; unset wallet_password' EXIT
if [[ -s "$wallet_file" ]]; then wallet_password=$(<"$wallet_file"); else wallet_password="C1$(openssl rand -hex 24)Z9"; (umask 077; printf '%s\n' "$wallet_password" > "$wallet_file"); fi
chmod 600 "$wallet_file"
printf '%s\n' "$wallet_password" > "$tmp/wallet.pw"; chmod 600 "$tmp/wallet.pw"

host_ok=false; server_ok=false
[[ -s "$wallet_dir/ewallet.pem" && -s "$wallet_dir/tnsnames.ora" ]] && grep -q '^-----BEGIN ENCRYPTED PRIVATE KEY-----$' "$wallet_dir/ewallet.pem" && host_ok=true
docker exec -u oracle "$container" test -s "$root/server-wallet/ewallet.p12" && docker exec -u oracle "$container" test -s "$root/server-wallet/cwallet.sso" && server_ok=true || true
if [[ "$host_ok" != true || "$server_ok" != true ]]; then
	docker exec -u root "$container" python -c "import shutil; shutil.rmtree('$root', ignore_errors=True)"
	python3 - "$wallet_dir" <<'PY'
import pathlib,sys
p=pathlib.Path(sys.argv[1])
for f in ('ewallet.pem','tnsnames.ora'): (p/f).unlink(missing_ok=True)
PY
	mkdir -m 700 "$tmp/certs"
	openssl genpkey -quiet -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$tmp/certs/ca.key" 2>/dev/null
	openssl req -new -x509 -key "$tmp/certs/ca.key" -out "$tmp/certs/ca.pem" -days 3650 -sha256 -subj '/CN=PiAgent C1 Lab CA' -addext 'basicConstraints=critical,CA:TRUE' -addext 'keyUsage=critical,keyCertSign,cRLSign' 2>/dev/null
	for x in server client; do openssl genpkey -quiet -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$tmp/certs/$x.key" 2>/dev/null; done
	openssl req -new -key "$tmp/certs/server.key" -out "$tmp/certs/server.csr" -subj "/CN=$host_ip"
	openssl req -new -key "$tmp/certs/client.key" -out "$tmp/certs/client.csr" -subj '/CN=PIAGENT_RO'
	printf 'subjectAltName=IP:%s\nextendedKeyUsage=serverAuth\nkeyUsage=critical,digitalSignature,keyEncipherment\n' "$host_ip" > "$tmp/server.ext"
	printf 'extendedKeyUsage=clientAuth\nkeyUsage=critical,digitalSignature,keyEncipherment\n' > "$tmp/client.ext"
	openssl x509 -req -in "$tmp/certs/server.csr" -CA "$tmp/certs/ca.pem" -CAkey "$tmp/certs/ca.key" -CAcreateserial -out "$tmp/certs/server.pem" -days 3650 -sha256 -extfile "$tmp/server.ext" 2>/dev/null
	openssl x509 -req -in "$tmp/certs/client.csr" -CA "$tmp/certs/ca.pem" -CAkey "$tmp/certs/ca.key" -CAserial "$tmp/certs/ca.srl" -out "$tmp/certs/client.pem" -days 3650 -sha256 -extfile "$tmp/client.ext" 2>/dev/null
	openssl pkcs8 -topk8 -in "$tmp/certs/client.key" -v2 aes-256-cbc -passout "file:$tmp/wallet.pw" -out "$wallet_dir/ewallet.pem"
	cat "$tmp/certs/client.pem" "$tmp/certs/ca.pem" >> "$wallet_dir/ewallet.pem"; chmod 600 "$wallet_dir/ewallet.pem"
	docker exec -u oracle "$container" mkdir -p "$root/server-wallet" "$root/import"
	for f in ca.pem server.key server.pem; do docker cp "$tmp/certs/$f" "$container:$root/import/$f"; done
	docker exec -u root "$container" chown -R oracle:oinstall "$root"
	docker exec -u root "$container" find "$root" -type d -exec chmod 700 {} \;
	docker exec -u root "$container" find "$root" -type f -exec chmod 600 {} \;
	docker cp "$tmp/wallet.pw" "$container:/tmp/wp37b-wallet.pw"
	docker exec -u root "$container" chown oracle:oinstall /tmp/wp37b-wallet.pw
	docker exec -u root "$container" chmod 600 /tmp/wp37b-wallet.pw
	openssl pkcs12 -export -in "$tmp/certs/server.pem" -inkey "$tmp/certs/server.key" -certfile "$tmp/certs/ca.pem" -out "$tmp/certs/server.p12" -passout "file:$tmp/wallet.pw"
	docker cp "$tmp/certs/server.p12" "$container:$root/import/server.p12"
	docker exec -u root "$container" chown oracle:oinstall "$root/import/server.p12"
	docker exec -u oracle "$container" bash -lc "export ORACLE_HOME=/opt/oracle/product/19c/dbhome_1 PATH=/opt/oracle/product/19c/dbhome_1/bin:\$PATH; orapki wallet create -wallet '$root/server-wallet' -pwd \"\$(cat /tmp/wp37b-wallet.pw)\"; orapki wallet import_pkcs12 -wallet '$root/server-wallet' -pwd \"\$(cat /tmp/wp37b-wallet.pw)\" -pkcs12file '$root/import/server.p12' -pkcs12pwd \"\$(cat /tmp/wp37b-wallet.pw)\"; orapki wallet create -wallet '$root/server-wallet' -pwd \"\$(cat /tmp/wp37b-wallet.pw)\" -auto_login"
	# Remove private staging key files from the container after wallet import.
	docker exec -u oracle "$container" rm -f "$root/import/server.key" "$root/import/server.p12"
	docker exec -u oracle "$container" chmod -R go-rwx "$root"
fi
cat > "$wallet_dir/tnsnames.ora" <<EOF
pipdb1_tcps=(DESCRIPTION=(ADDRESS=(PROTOCOL=TCPS)(HOST=$host_ip)(PORT=2484))(CONNECT_DATA=(SERVICE_NAME=pipdb1))(SECURITY=(SSL_SERVER_DN_MATCH=YES)(SSL_SERVER_CERT_DN="CN=$host_ip")))
EOF
chmod 600 "$wallet_dir/tnsnames.ora"
backup="$config/wp37b-backup-$(date -u +%Y%m%dT%H%M%SZ)"
docker exec -u oracle "$container" mkdir -p "$backup"
docker exec -u oracle "$container" cp -p "$config/listener.ora" "$config/sqlnet.ora" "$backup/"
cat > "$tmp/listener.block" <<EOF
# BEGIN WP-37B TCPS
    (ADDRESS = (PROTOCOL = TCPS)(HOST = 0.0.0.0)(PORT = 2484))
# END WP-37B TCPS
EOF
cat > "$tmp/sqlnet.block" <<EOF
# BEGIN WP-37B TCPS
SSL_CLIENT_AUTHENTICATION=TRUE
WALLET_LOCATION=(SOURCE=(METHOD=FILE)(METHOD_DATA=(DIRECTORY=$root/server-wallet)))
# END WP-37B TCPS
EOF
for spec in "listener.ora listener" "sqlnet.ora sqlnet"; do
	set -- $spec; file=$1; block="$tmp/$2.block"
	if [[ "$2" == sqlnet ]]; then
		cat > "$block" <<EOF
# BEGIN WP-37B TCPS
SSL_CLIENT_AUTHENTICATION=TRUE
WALLET_LOCATION=(SOURCE=(METHOD=FILE)(METHOD_DATA=(DIRECTORY=$root/server-wallet)))
# END WP-37B TCPS
EOF
	fi
	docker cp "$block" "$container:/tmp/wp37b-$2.block"
	docker exec -u root "$container" chown oracle:oinstall "/tmp/wp37b-$2.block"
	docker exec -i -u oracle "$container" python - "$config/$file" "/tmp/wp37b-$2.block" "$2" <<'PY'
import sys
p,b,kind=sys.argv[1:]; text=open(p).read(); start='# BEGIN WP-37B TCPS'; end='# END WP-37B TCPS'
while start in text:
 a=text.index(start); z=text.find(end,a)
 if z<0: text=text[:a].rstrip()+'\n'; break
 text=text[:a].rstrip()+text[z+len(end):]
block=open(b).read().strip()
if kind == 'listener':
 needle='    (ADDRESS = (PROTOCOL = TCP)(HOST = 0.0.0.0)(PORT = 1521))'
 idx=text.index(needle)+len(needle)
 text=text[:idx]+'\n'+block+text[idx:]
else: text=text.rstrip()+'\n\n'+block+'\n'
open(p,'w').write(text)
PY
done
docker exec -u oracle "$container" bash -lc 'lsnrctl reload LISTENER'
docker exec -u oracle "$container" rm -f /tmp/wp37b-wallet.pw /tmp/wp37b-listener.block /tmp/wp37b-sqlnet.block
echo 'C1 TCPS setup complete; run scripts/lab/c1-tcps/verify.sh.'
