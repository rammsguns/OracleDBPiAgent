#!/usr/bin/env bash
set -euo pipefail
container=oracle19c-cdb
secrets=${PIAGENT_SECRET_DIR:-/home/kiwi/OracleDBHarness/databases/secrets}
wallet_dir=/home/kiwi/OracleDBHarness/databases/wallets/c1-tcps
root=/opt/oracle/admin/CDB19/tcps
config=/opt/oracle/oradata/dbconfig/CDB19
host_ip=
wallet_file="$secrets/c1_tcps_wallet.pw"
docker inspect "$container" >/dev/null
host_ip=$(docker inspect -f '{{.NetworkSettings.Networks.bridge.IPAddress}}' "$container")
[[ -n "$host_ip" ]] || { echo 'Cannot determine C1 bridge IP' >&2; exit 1; }
mkdir -p "$(dirname "$wallet_dir")" "$wallet_dir"
chmod 700 "$(dirname "$wallet_dir")" "$wallet_dir"
tmp=$(mktemp -d); chmod 700 "$tmp"
cleanup() {
	status=$?
	python3 - "$tmp" <<'PY'
import shutil,sys
shutil.rmtree(sys.argv[1],ignore_errors=True)
PY
	docker exec -u root "$container" rm -f /tmp/wp37b-wallet.pw /tmp/wp37b-listener.block /tmp/wp37b-sqlnet.block "$root/import/server.key" "$root/import/server.p12" >/dev/null 2>&1 || true
	unset wallet_password
	return "$status"
}
trap cleanup EXIT
if [[ -s "$wallet_file" ]]; then wallet_password=$(<"$wallet_file"); else wallet_password="C1$(openssl rand -hex 24)Z9"; (umask 077; printf '%s\n' "$wallet_password" > "$wallet_file"); fi
chmod 600 "$wallet_file"
printf '%s\n' "$wallet_password" > "$tmp/wallet.pw"; chmod 600 "$tmp/wallet.pw"

host_ok=false; server_ok=false
if [[ -s "$wallet_dir/ewallet.pem" && -s "$wallet_dir/tnsnames.ora" ]] && grep -q '^-----BEGIN ENCRYPTED PRIVATE KEY-----$' "$wallet_dir/ewallet.pem" && grep -Fq "HOST=$host_ip)" "$wallet_dir/tnsnames.ora"; then host_ok=true; fi
if docker exec -u oracle "$container" test -s "$root/server-wallet/ewallet.p12" && docker exec -u oracle "$container" test -s "$root/server-wallet/cwallet.sso" && docker exec -u oracle "$container" test -s "$root/import/server.pem"; then
	server_san=$(docker exec -u oracle "$container" openssl x509 -in "$root/import/server.pem" -noout -text 2>/dev/null | sed -n '/Subject Alternative Name/{n;p;}' || true)
	grep -Fq "IP Address:$host_ip" <<<"$server_san" && server_ok=true
fi
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
	openssl pkcs12 -export -in "$tmp/certs/server.pem" -inkey "$tmp/certs/server.key" -certfile "$tmp/certs/ca.pem" -out "$tmp/certs/server.p12" -passout "file:$tmp/wallet.pw"
	docker cp "$tmp/certs/server.p12" "$container:$root/import/server.p12"
	docker exec -u root "$container" chown oracle:oinstall "$root/import/server.p12"
	docker exec -u root "$container" chmod 600 "$root/import/server.p12"
	cat "$tmp/wallet.pw" "$tmp/wallet.pw" | docker exec -i -u oracle "$container" bash -lc "export ORACLE_HOME=/opt/oracle/product/19c/dbhome_1 PATH=/opt/oracle/product/19c/dbhome_1/bin:\$PATH; orapki wallet create -wallet '$root/server-wallet'"
	cat "$tmp/wallet.pw" "$tmp/wallet.pw" | docker exec -i -u oracle "$container" bash -lc "export ORACLE_HOME=/opt/oracle/product/19c/dbhome_1 PATH=/opt/oracle/product/19c/dbhome_1/bin:\$PATH; orapki wallet import_pkcs12 -wallet '$root/server-wallet' -pkcs12file '$root/import/server.p12'"
	cat "$tmp/wallet.pw" | docker exec -i -u oracle "$container" bash -lc "export ORACLE_HOME=/opt/oracle/product/19c/dbhome_1 PATH=/opt/oracle/product/19c/dbhome_1/bin:\$PATH; orapki wallet create -wallet '$root/server-wallet' -auto_login"
	# Remove private staging key files from the container after wallet import.
	docker exec -u oracle "$container" rm -f "$root/import/server.key" "$root/import/server.p12"
	docker exec -u oracle "$container" chmod -R go-rwx "$root"
fi
cat > "$wallet_dir/tnsnames.ora" <<EOF
pipdb1_tcps=(DESCRIPTION=(ADDRESS=(PROTOCOL=TCPS)(HOST=$host_ip)(PORT=2484))(CONNECT_DATA=(SERVICE_NAME=pipdb1))(SECURITY=(SSL_SERVER_DN_MATCH=YES)(SSL_SERVER_CERT_DN="CN=$host_ip")))
EOF
chmod 600 "$wallet_dir/tnsnames.ora"
backup="$config/wp37b-backup-$(date -u +%Y%m%dT%H%M%SZ)"
latest_backup=$(docker exec -u oracle "$container" bash -lc "find '$config' -maxdepth 1 -type d -name 'wp37b-backup-*' -printf '%f\\n' | sort | tail -1")
if [[ -z "$latest_backup" ]] || ! docker exec -u oracle "$container" cmp -s "$config/listener.ora" "$config/$latest_backup/listener.ora" || ! docker exec -u oracle "$container" cmp -s "$config/sqlnet.ora" "$config/$latest_backup/sqlnet.ora"; then
	docker exec -u oracle "$container" mkdir -m 700 -p "$backup"
	docker exec -u oracle "$container" cp "$config/listener.ora" "$config/sqlnet.ora" "$backup/"
	docker exec -u oracle "$container" chmod 600 "$backup/listener.ora" "$backup/sqlnet.ora"
fi
docker exec -i -u root "$container" python - "$config" <<'PY'
import os,shutil,sys
base=sys.argv[1]
dirs=sorted(n for n in os.listdir(base) if n.startswith('wp37b-backup-') and os.path.isdir(os.path.join(base,n)))
if dirs:
 oldest=dirs[0]
 for name in ('listener.ora','sqlnet.ora'):
  data=open(os.path.join(base,oldest,name),'r').read()
  if 'WP-37B' in data: raise SystemExit('Oldest WP-37B backup is not the original configuration; refusing prune')
 keep=set((dirs[0],dirs[-1]))
 for name in dirs:
  path=os.path.join(base,name)
  if name not in keep: shutil.rmtree(path)
  else:
   os.chmod(path,0o700)
   for entry in os.listdir(path):
    f=os.path.join(path,entry)
    if os.path.isfile(f): os.chmod(f,0o600)
PY
cat > "$tmp/listener.block" <<EOF
# BEGIN WP-37B TCPS
LISTENER_TCPS=(DESCRIPTION_LIST=(DESCRIPTION=(ADDRESS=(PROTOCOL=IPC)(KEY=LISTENER_TCPS)))(DESCRIPTION=(ADDRESS=(PROTOCOL=TCPS)(HOST=0.0.0.0)(PORT=2484))(SECURITY=(WALLET_LOCATION=$root/server-wallet))))
WALLET_LOCATION_LISTENER_TCPS=(SOURCE=(METHOD=FILE)(METHOD_DATA=(DIRECTORY=$root/server-wallet)))
SSL_CLIENT_AUTHENTICATION_LISTENER_TCPS=TRUE
WALLET_LOCATION=(SOURCE=(METHOD=FILE)(METHOD_DATA=(DIRECTORY=$root/server-wallet)))
SID_LIST_LISTENER_TCPS=(SID_LIST=(SID_DESC=(GLOBAL_DBNAME=pipdb1)(ORACLE_HOME=/opt/oracle/product/19c/dbhome_1)(SID_NAME=CDB19)))
# END WP-37B TCPS
EOF
docker cp "$tmp/listener.block" "$container:/tmp/wp37b-listener.block"
docker exec -u root "$container" chown oracle:oinstall /tmp/wp37b-listener.block
docker exec -i -u oracle "$container" python - "$config/listener.ora" /tmp/wp37b-listener.block <<'PY'
import sys
p,b=sys.argv[1:]; text=open(p).read(); start='# BEGIN WP-37B TCPS'; end='# END WP-37B TCPS'
while start in text:
 a=text.index(start); z=text.find(end,a)
 if z<0: text=text[:a].rstrip()+'\n'; break
 text=text[:a].rstrip()+text[z+len(end):]
tcps='    (ADDRESS = (PROTOCOL = TCPS)(HOST = 0.0.0.0)(PORT = 2484))'
text='\n'.join(line for line in text.splitlines() if tcps not in line)
replacement=text.rstrip()+'\n\n'+open(b).read().strip()+'\n'
mode=__import__('stat').S_IMODE(__import__('os').stat(p).st_mode)
fd,tmp=__import__('tempfile').mkstemp(prefix='.wp37b-listener-',dir=__import__('os').path.dirname(p))
f=__import__('os').fdopen(fd,'w'); f.write(replacement); f.flush(); __import__('os').fsync(f.fileno()); f.close()
__import__('os').chmod(tmp,mode); getattr(__import__('os'),'replace',__import__('os').rename)(tmp,p)
PY
cat > "$tmp/sqlnet.block" <<EOF
# BEGIN WP-37B TCPS
SSL_CLIENT_AUTHENTICATION=TRUE
WALLET_LOCATION=(SOURCE=(METHOD=FILE)(METHOD_DATA=(DIRECTORY=$root/server-wallet)))
# END WP-37B TCPS
EOF
docker cp "$tmp/sqlnet.block" "$container:/tmp/wp37b-sqlnet.block"
docker exec -u root "$container" chown oracle:oinstall /tmp/wp37b-sqlnet.block
docker exec -i -u oracle "$container" python - "$config/sqlnet.ora" /tmp/wp37b-sqlnet.block <<'PY'
import sys
p,b=sys.argv[1:]; s=open(p).read(); a='# BEGIN WP-37B TCPS'; z='# END WP-37B TCPS'
while a in s:
 i=s.index(a); j=s.find(z,i); s=s[:i].rstrip()+'\n' if j<0 else s[:i].rstrip()+s[j+len(z):]
replacement=s.rstrip()+'\n\n'+open(b).read().strip()+'\n'
os=__import__('os'); stat=__import__('stat'); tempfile=__import__('tempfile')
mode=stat.S_IMODE(os.stat(p).st_mode); fd,tmp=tempfile.mkstemp(prefix='.wp37b-sqlnet-',dir=os.path.dirname(p))
f=os.fdopen(fd,'w'); f.write(replacement); f.flush(); os.fsync(f.fileno()); f.close(); os.chmod(tmp,mode); getattr(os,'replace',os.rename)(tmp,p)
PY
docker exec -u oracle "$container" bash -lc 'lsnrctl reload LISTENER; lsnrctl stop LISTENER_TCPS >/dev/null 2>&1 || true; lsnrctl start LISTENER_TCPS'
docker exec -u oracle "$container" rm -f /tmp/wp37b-listener.block /tmp/wp37b-sqlnet.block
echo 'C1 TCPS setup complete; run scripts/lab/c1-tcps/verify.sh.'
