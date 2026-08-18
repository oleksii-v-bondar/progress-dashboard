#!/bin/bash
set -euo pipefail
exec > /var/log/progress-app-setup.log 2>&1
echo "=== Progress App Setup Started: $(date) ==="

DUCKDNS_TOKEN="${duckdns_token}"
DUCKDNS_SUBDOMAIN="${duckdns_subdomain}"
DOMAIN="$${DUCKDNS_SUBDOMAIN}.duckdns.org"
REPO_URL="${repo_url}"
BUCKET_NAME="${bucket_name}"
NAMESPACE="${namespace}"
APP_DIR="/opt/progress-app"

# ── 1. System update & packages ───────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
  docker.io \
  docker-compose-plugin \
  git \
  curl \
  python3-pip \
  certbot

# Install certbot-dns-duckdns plugin
pip3 install --break-system-packages certbot-dns-duckdns

# Install OCI CLI
curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh \
  | bash -s -- --accept-all-defaults
export PATH="$PATH:/root/bin"
echo 'export PATH="$PATH:/root/bin"' >> /root/.bashrc

# Enable Docker service
systemctl enable docker
systemctl start docker

# ── 2. Mount block volume ─────────────────────────────────────────────────────
echo "=== Waiting for block volume device ==="
DEVICE=""
for i in $(seq 1 60); do
  if [ -b /dev/oracleoci/oraclevdb ]; then
    DEVICE="/dev/oracleoci/oraclevdb"
    break
  elif [ -b /dev/sdb ]; then
    DEVICE="/dev/sdb"
    break
  fi
  echo "Attempt $i: device not found yet, waiting 10s..."
  sleep 10
done

if [ -z "$DEVICE" ]; then
  echo "ERROR: Block volume device not found after 10 minutes. Aborting."
  exit 1
fi

echo "Found block volume at $DEVICE"

# Format only if not already formatted
if ! blkid "$DEVICE" | grep -q ext4; then
  echo "Formatting $DEVICE as ext4..."
  mkfs.ext4 "$DEVICE"
fi

mkdir -p /data
mount "$DEVICE" /data

# Persist mount across reboots
DEVICE_UUID=$(blkid -s UUID -o value "$DEVICE")
echo "UUID=$DEVICE_UUID /data ext4 defaults,nofail 0 2" >> /etc/fstab

# Create Postgres data dir on block volume
mkdir -p /data/pgdata

echo "=== Block volume mounted at /data ==="

# ── 3. Clone repository ───────────────────────────────────────────────────────
git clone "$REPO_URL" "$APP_DIR"
cd "$APP_DIR"

# ── 4. Generate .env.prod ─────────────────────────────────────────────────────
DB_PASSWORD=$(openssl rand -base64 32 | tr -d '=+/' | cut -c1-32)
cat > "$APP_DIR/.env.prod" <<EOF
DB_PASSWORD=$DB_PASSWORD
EOF
chmod 600 "$APP_DIR/.env.prod"

# ── 5. DuckDNS IP update ──────────────────────────────────────────────────────
cat > /usr/local/bin/duckdns-update.sh <<'DUCKDNS'
#!/bin/bash
TOKEN="DUCKDNS_TOKEN_PLACEHOLDER"
SUBDOMAIN="DUCKDNS_SUBDOMAIN_PLACEHOLDER"
curl -s "https://www.duckdns.org/update?domains=$SUBDOMAIN&token=$TOKEN&ip=" > /var/log/duckdns.log
DUCKDNS

sed -i "s|DUCKDNS_TOKEN_PLACEHOLDER|$DUCKDNS_TOKEN|" /usr/local/bin/duckdns-update.sh
sed -i "s|DUCKDNS_SUBDOMAIN_PLACEHOLDER|$DUCKDNS_SUBDOMAIN|" /usr/local/bin/duckdns-update.sh
chmod +x /usr/local/bin/duckdns-update.sh

# Update immediately to register IP
/usr/local/bin/duckdns-update.sh
echo "DuckDNS update result: $(cat /var/log/duckdns.log)"

# ── 6. Issue Let's Encrypt certificate ────────────────────────────────────────
# Write DuckDNS credentials for certbot plugin
mkdir -p /etc/letsencrypt
cat > /etc/duckdns-certbot.ini <<EOF
dns_duckdns_token = $DUCKDNS_TOKEN
EOF
chmod 600 /etc/duckdns-certbot.ini

certbot certonly \
  --authenticator dns-duckdns \
  --dns-duckdns-credentials /etc/duckdns-certbot.ini \
  --dns-duckdns-propagation-seconds 60 \
  -d "$DOMAIN" \
  --non-interactive \
  --agree-tos \
  --email "admin@$DOMAIN" \
  --no-eff-email

echo "=== Certificate issued for $DOMAIN ==="

# ── 7. Configure nginx with real domain ───────────────────────────────────────
sed -i "s|DOMAIN_PLACEHOLDER|$DOMAIN|g" "$APP_DIR/nginx/nginx.conf"

# ── 8. Start the stack ────────────────────────────────────────────────────────
cd "$APP_DIR"
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

echo "=== Docker stack started ==="

# ── 9. Set up cron jobs ───────────────────────────────────────────────────────
# pg_dump backup script
cat > /usr/local/bin/pg-backup.sh <<PGBACKUP
#!/bin/bash
set -euo pipefail
export PATH="\$PATH:/root/bin"
DATE=\$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="/tmp/pg_backup_\$DATE.sql.gz"
docker compose -f $APP_DIR/docker-compose.prod.yml --env-file $APP_DIR/.env.prod exec -T db \
  pg_dump -U progress progress | gzip > "\$BACKUP_FILE"
oci os object put \
  --bucket-name $BUCKET_NAME \
  --namespace-name $NAMESPACE \
  --name "backup-\$DATE.sql.gz" \
  --file "\$BACKUP_FILE" \
  --auth instance_principal
rm "\$BACKUP_FILE"
echo "Backup completed: backup-\$DATE.sql.gz"

# Keep only last 30 backups
oci os object list --bucket-name $BUCKET_NAME --namespace-name $NAMESPACE \
  --auth instance_principal --all 2>/dev/null | \
  python3 -c "
import sys,json
items=json.load(sys.stdin)['data']
items.sort(key=lambda x: x['name'])
for item in items[:-30]:
    print(item['name'])
" | while read name; do
  oci os object delete --bucket-name $BUCKET_NAME --namespace-name $NAMESPACE \
    --name "\$name" --auth instance_principal --force 2>/dev/null || true
done
PGBACKUP
chmod +x /usr/local/bin/pg-backup.sh

# Write crontab
(crontab -l 2>/dev/null || true; cat <<CRON
# DuckDNS: update IP every 5 minutes
*/5 * * * * /usr/local/bin/duckdns-update.sh >> /var/log/duckdns.log 2>&1

# Certbot: renew twice daily
0 0,12 * * * certbot renew --quiet --post-hook "docker compose -f $APP_DIR/docker-compose.prod.yml --env-file $APP_DIR/.env.prod restart nginx"

# pg_dump backup: daily at 2 AM UTC
0 2 * * * /usr/local/bin/pg-backup.sh >> /var/log/pg-backup.log 2>&1
CRON
) | crontab -

echo "=== Cron jobs installed ==="
echo "=== Setup Complete: $(date) ==="
echo "=== App should be live at https://$DOMAIN ==="
