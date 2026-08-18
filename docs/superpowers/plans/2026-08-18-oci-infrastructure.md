# OCI Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision a free-tier OCI ARM VM running the progress-app in production via Terraform, with HTTPS via DuckDNS + Let's Encrypt, Postgres data on a persistent block volume, and daily pg_dump backups to OCI Object Storage.

**Architecture:** A single `VM.Standard.A1.Flex` instance (2 OCPU / 12 GB) runs the full stack via `docker-compose.prod.yml`. Nginx terminates TLS and reverse-proxies to backend/frontend containers. Terraform provisions all OCI resources (VCN, subnet, security list, instance, block volume, object storage bucket, IAM policy for instance principal). A cloud-init script bootstraps Docker, mounts the block volume, clones the repo, issues a Let's Encrypt cert via DuckDNS DNS challenge, and starts the stack.

**Tech Stack:** Terraform `~> 5.0` OCI provider, Docker Compose v2, Nginx (alpine container), Certbot + `certbot-dns-duckdns`, Ubuntu 22.04 ARM (OCI A1), OCI CLI (instance principal auth for pg_dump upload).

## Global Constraints

- OCI Free Tier only: shape `VM.Standard.A1.Flex` 2 OCPU / 12 GB RAM, block volume 50 GB, object storage standard bucket
- Terraform state is local — no remote backend
- `terraform.tfvars` and `.env.prod` are NEVER committed — both are git-ignored
- All shell scripts must be POSIX-compatible (`#!/bin/bash`, `set -euo pipefail`)
- Docker Compose file: `docker-compose.prod.yml` at repo root; uses `Dockerfile.prod` for backend and frontend
- Block volume mounted at `/data`; Postgres data directory at `/data/pgdata`
- DuckDNS subdomain format: `<subdomain>.duckdns.org`
- Nginx config contains literal string `DOMAIN_PLACEHOLDER` which `user_data.sh` substitutes with `sed`
- Backend compiled output: `dist/backend/src/index.js` (due to `rootDir: ".."` in tsconfig — verify in Task 1)
- OCI CLI uses `--auth instance_principal` for all commands on the VM

---

## File Map

**New files:**
- `backend/Dockerfile.prod`
- `frontend/Dockerfile.prod`
- `nginx/nginx.conf`
- `docker-compose.prod.yml`
- `.env.prod.example`
- `infra/terraform/main.tf`
- `infra/terraform/variables.tf`
- `infra/terraform/outputs.tf`
- `infra/terraform/terraform.tfvars.example`
- `infra/terraform/user_data.sh`

**Modified files:**
- `.gitignore` — add terraform state, tfvars, .env.prod

---

## Task 1: Production Dockerfiles + .gitignore

**Files:**
- Create: `backend/Dockerfile.prod`
- Create: `frontend/Dockerfile.prod`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `backend` image that runs `node dist/backend/src/index.js`; `frontend` image that serves static files on port 80 via nginx

- [ ] **Step 1: Verify backend compiled output path**

Run in project root:
```bash
cd /Users/e161739/ClaudeWorkspace/progress-app/backend
npm run build 2>&1
find dist -name "index.js"
```
Expected output: `dist/backend/src/index.js`

If the path differs, note it and use the actual path in Step 2.

- [ ] **Step 2: Create backend/Dockerfile.prod**

The backend uses a multi-stage build: compile TypeScript, then copy the compiled output to a clean runtime image. The `rootDir: ".."` in tsconfig means `backend/src/index.ts` compiles to `backend/dist/backend/src/index.js`.

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY backend/package.json ./
RUN npm install
COPY backend/tsconfig.json ./
COPY backend/src/ ./src/
COPY shared/ ./shared/
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 4000
CMD ["node", "dist/backend/src/index.js"]
```

> If Step 1 showed a different path, update the CMD accordingly.

- [ ] **Step 3: Create frontend/Dockerfile.prod**

Vite builds the static site; nginx serves it. The production build does NOT use Vite's dev server or its proxy — nginx (the outer reverse proxy) handles `/api` routing.

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY frontend/package.json ./
RUN npm install
COPY frontend/tsconfig.json ./
COPY frontend/vite.config.ts ./
COPY frontend/index.html ./
COPY frontend/src/ ./src/
COPY shared/ /shared/
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
```

- [ ] **Step 4: Test both builds locally**

```bash
cd /Users/e161739/ClaudeWorkspace/progress-app

# Build backend prod image
docker build -f backend/Dockerfile.prod -t progress-backend-prod .
echo "Backend build exit: $?"

# Build frontend prod image
docker build -f frontend/Dockerfile.prod -t progress-frontend-prod .
echo "Frontend build exit: $?"
```
Expected: both exit with `0`. If backend fails with a path error, revisit Step 1.

- [ ] **Step 5: Add infra entries to .gitignore**

Read the existing `.gitignore` first, then append:
```
# Terraform
infra/terraform/.terraform/
infra/terraform/*.tfstate
infra/terraform/*.tfstate.backup
infra/terraform/*.tfplan
infra/terraform/terraform.tfvars

# Production env
.env.prod
```

- [ ] **Step 6: Commit**

```bash
git add backend/Dockerfile.prod frontend/Dockerfile.prod .gitignore
git commit -m "feat: add production Dockerfiles for backend and frontend"
```

---

## Task 2: docker-compose.prod.yml + nginx/nginx.conf + .env.prod.example

**Files:**
- Create: `docker-compose.prod.yml`
- Create: `nginx/nginx.conf`
- Create: `.env.prod.example`

**Interfaces:**
- Consumes: `backend/Dockerfile.prod` and `frontend/Dockerfile.prod` (Task 1)
- Produces: full production stack definition; nginx reverse proxy config with `DOMAIN_PLACEHOLDER`

- [ ] **Step 1: Create nginx/nginx.conf**

The `DOMAIN_PLACEHOLDER` string is substituted with the real domain by `user_data.sh` on the VM using sed. The Let's Encrypt cert path uses the same domain.

```nginx
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name DOMAIN_PLACEHOLDER;

    ssl_certificate     /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location /api/ {
        proxy_pass http://backend:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://frontend:80;
        proxy_set_header Host $host;
    }
}
```

- [ ] **Step 2: Create docker-compose.prod.yml**

Postgres data directory is on the block volume at `/data/pgdata`. No source volume mounts (no hot reload). All containers restart unless stopped.

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: progress
      POSTGRES_USER: progress
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - /data/pgdata:/var/lib/postgresql/data
      - ./database/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U progress"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile.prod
    environment:
      DB_HOST: db
      DB_PORT: 5432
      DB_USER: progress
      DB_PASSWORD: ${DB_PASSWORD}
      DB_NAME: progress
      PORT: 4000
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  frontend:
    build:
      context: .
      dockerfile: frontend/Dockerfile.prod
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - backend
      - frontend
    restart: unless-stopped
```

- [ ] **Step 3: Create .env.prod.example**

```bash
# Copy to .env.prod on the VM — never commit .env.prod
DB_PASSWORD=change_me_to_a_random_string
```

- [ ] **Step 4: Verify docker-compose.prod.yml syntax**

```bash
cd /Users/e161739/ClaudeWorkspace/progress-app
docker compose -f docker-compose.prod.yml config --quiet
echo "Compose syntax exit: $?"
```
Expected: exit `0` (it will warn about missing .env.prod — that's fine for a syntax check).

- [ ] **Step 5: Commit**

```bash
git add docker-compose.prod.yml nginx/nginx.conf .env.prod.example
git commit -m "feat: add production compose stack and nginx reverse proxy config"
```

---

## Task 3: Terraform — all OCI resources

**Files:**
- Create: `infra/terraform/variables.tf`
- Create: `infra/terraform/main.tf`
- Create: `infra/terraform/outputs.tf`
- Create: `infra/terraform/terraform.tfvars.example`

**Interfaces:**
- Produces:
  - VCN, subnet, IGW, route table, security list
  - `VM.Standard.A1.Flex` instance (Ubuntu 22.04 ARM) with SSH key
  - 50 GB block volume attached to the instance
  - Object Storage bucket for pg_dump backups
  - Dynamic group + IAM policy for instance principal access to the bucket
  - Outputs: `instance_public_ip`, `object_storage_bucket_name`, `object_storage_namespace`

- [ ] **Step 1: Create infra/terraform/variables.tf**

```hcl
variable "tenancy_ocid" {
  description = "OCID of your OCI tenancy"
  type        = string
}

variable "compartment_ocid" {
  description = "OCID of the compartment to deploy into"
  type        = string
}

variable "region" {
  description = "OCI region (e.g. eu-frankfurt-1, us-ashburn-1)"
  type        = string
}

variable "ssh_public_key" {
  description = "SSH public key string for VM access (e.g. 'ssh-ed25519 AAAA...')"
  type        = string
}

variable "duckdns_token" {
  description = "DuckDNS API token from duckdns.org"
  type        = string
  sensitive   = true
}

variable "duckdns_subdomain" {
  description = "DuckDNS subdomain (just the name, not .duckdns.org)"
  type        = string
}

variable "repo_url" {
  description = "Git repository URL to clone on the VM (https or ssh)"
  type        = string
}
```

- [ ] **Step 2: Create infra/terraform/main.tf**

```hcl
terraform {
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 6.0"
    }
  }
}

provider "oci" {
  tenancy_ocid = var.tenancy_ocid
  region       = var.region
  # Uses ~/.oci/config default profile — no credentials in code
}

# ── Data sources ──────────────────────────────────────────────────────────────

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

data "oci_core_images" "ubuntu_arm" {
  compartment_id           = var.compartment_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "22.04"
  shape                    = "VM.Standard.A1.Flex"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

data "oci_objectstorage_namespace" "ns" {
  compartment_id = var.tenancy_ocid
}

# ── Networking ────────────────────────────────────────────────────────────────

resource "oci_core_vcn" "app" {
  compartment_id = var.compartment_ocid
  cidr_block     = "10.0.0.0/16"
  display_name   = "progress-app-vcn"
  dns_label      = "progressapp"
}

resource "oci_core_internet_gateway" "app" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.app.id
  display_name   = "progress-app-igw"
}

resource "oci_core_route_table" "app" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.app.id
  display_name   = "progress-app-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    network_entity_id = oci_core_internet_gateway.app.id
  }
}

resource "oci_core_security_list" "app" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.app.id
  display_name   = "progress-app-sl"

  # Allow all outbound
  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }

  # SSH
  ingress_security_rules {
    protocol = "6" # TCP
    source   = "0.0.0.0/0"
    tcp_options {
      min = 22
      max = 22
    }
  }

  # HTTP
  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 80
      max = 80
    }
  }

  # HTTPS
  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 443
      max = 443
    }
  }
}

resource "oci_core_subnet" "app" {
  compartment_id    = var.compartment_ocid
  vcn_id            = oci_core_vcn.app.id
  cidr_block        = "10.0.1.0/24"
  display_name      = "progress-app-subnet"
  dns_label         = "app"
  route_table_id    = oci_core_route_table.app.id
  security_list_ids = [oci_core_security_list.app.id]
}

# ── Compute ───────────────────────────────────────────────────────────────────

resource "oci_core_instance" "app" {
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  compartment_id      = var.compartment_ocid
  display_name        = "progress-app"
  shape               = "VM.Standard.A1.Flex"

  shape_config {
    ocpus         = 2
    memory_in_gbs = 12
  }

  source_details {
    source_type = "image"
    source_id   = data.oci_core_images.ubuntu_arm.images[0].id
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.app.id
    assign_public_ip = true
    display_name     = "progress-app-vnic"
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data = base64encode(templatefile("${path.module}/user_data.sh", {
      duckdns_token     = var.duckdns_token
      duckdns_subdomain = var.duckdns_subdomain
      repo_url          = var.repo_url
      bucket_name       = oci_objectstorage_bucket.backups.name
      namespace         = data.oci_objectstorage_namespace.ns.namespace
    }))
  }
}

# ── Block Volume ──────────────────────────────────────────────────────────────

resource "oci_core_volume" "data" {
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  compartment_id      = var.compartment_ocid
  display_name        = "progress-app-data"
  size_in_gbs         = 50
}

resource "oci_core_volume_attachment" "data" {
  attachment_type = "paravirtualized"
  instance_id     = oci_core_instance.app.id
  volume_id       = oci_core_volume.data.id
  display_name    = "progress-app-data-attachment"
}

# ── Object Storage ────────────────────────────────────────────────────────────

resource "oci_objectstorage_bucket" "backups" {
  compartment_id = var.compartment_ocid
  name           = "progress-app-backups"
  namespace      = data.oci_objectstorage_namespace.ns.namespace
  access_type    = "NoPublicAccess"
  storage_tier   = "Standard"
}

# ── IAM: Instance Principal for Object Storage ────────────────────────────────

resource "oci_identity_dynamic_group" "app_instance" {
  compartment_id = var.tenancy_ocid
  name           = "progress-app-instances"
  description    = "Dynamic group for progress-app VM instance principal"
  matching_rule  = "instance.id = '${oci_core_instance.app.id}'"
}

resource "oci_identity_policy" "instance_object_storage" {
  compartment_id = var.tenancy_ocid
  name           = "progress-app-instance-storage"
  description    = "Allow progress-app VM to write pg_dump backups to object storage"
  statements = [
    "Allow dynamic-group ${oci_identity_dynamic_group.app_instance.name} to manage objects in compartment id ${var.compartment_ocid} where target.bucket.name = '${oci_objectstorage_bucket.backups.name}'"
  ]
}
```

- [ ] **Step 3: Create infra/terraform/outputs.tf**

```hcl
output "instance_public_ip" {
  description = "Public IP of the app VM — point your DuckDNS subdomain here"
  value       = oci_core_instance.app.public_ip
}

output "object_storage_bucket_name" {
  description = "Name of the Object Storage bucket for pg_dump backups"
  value       = oci_objectstorage_bucket.backups.name
}

output "object_storage_namespace" {
  description = "Object Storage namespace"
  value       = data.oci_objectstorage_namespace.ns.namespace
}

output "ssh_command" {
  description = "SSH command to connect to the VM"
  value       = "ssh ubuntu@${oci_core_instance.app.public_ip}"
}
```

- [ ] **Step 4: Create infra/terraform/terraform.tfvars.example**

```hcl
# Copy to terraform.tfvars and fill in your values
# terraform.tfvars is git-ignored — never commit it

tenancy_ocid      = "ocid1.tenancy.oc1..aaaaaaaa..."
compartment_ocid  = "ocid1.compartment.oc1..aaaaaaaa..."
region            = "eu-frankfurt-1"
ssh_public_key    = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5... user@host"
duckdns_token     = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
duckdns_subdomain = "myprogress"
repo_url          = "https://github.com/yourusername/progress-app.git"
```

- [ ] **Step 5: Validate Terraform config**

```bash
cd /Users/e161739/ClaudeWorkspace/progress-app/infra/terraform
terraform init
terraform validate
```
Expected: `Success! The configuration is valid.`

Note: `terraform init` downloads the OCI provider (~200 MB). `terraform validate` checks HCL syntax without connecting to OCI.

- [ ] **Step 6: Commit**

```bash
git add infra/terraform/
git commit -m "feat: add Terraform config for OCI free-tier infrastructure"
```

---

## Task 4: cloud-init user_data.sh

**Files:**
- Create: `infra/terraform/user_data.sh`

**Interfaces:**
- Consumes: Terraform template variables `duckdns_token`, `duckdns_subdomain`, `repo_url`, `bucket_name`, `namespace`
- Produces: fully bootstrapped VM — Docker running, block volume mounted at `/data`, stack live at `https://<subdomain>.duckdns.org`

- [ ] **Step 1: Create infra/terraform/user_data.sh**

This script runs as root on first boot via cloud-init. Terraform injects the template variables.

```bash
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
apt-get update -y
apt-get install -y \
  docker.io \
  docker-compose-plugin \
  git \
  curl \
  python3-pip \
  certbot

# Install certbot-dns-duckdns plugin
pip3 install certbot-dns-duckdns

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

sed -i "s/DUCKDNS_TOKEN_PLACEHOLDER/$DUCKDNS_TOKEN/" /usr/local/bin/duckdns-update.sh
sed -i "s/DUCKDNS_SUBDOMAIN_PLACEHOLDER/$DUCKDNS_SUBDOMAIN/" /usr/local/bin/duckdns-update.sh
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
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" "$APP_DIR/nginx/nginx.conf"

# ── 8. Start the stack ────────────────────────────────────────────────────────
cd "$APP_DIR"
docker compose -f docker-compose.prod.yml up -d --build

echo "=== Docker stack started ==="

# ── 9. Set up cron jobs ───────────────────────────────────────────────────────
# pg_dump backup script
cat > /usr/local/bin/pg-backup.sh <<PGBACKUP
#!/bin/bash
set -euo pipefail
export PATH="\$PATH:/root/bin"
DATE=\$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="/tmp/pg_backup_\$DATE.sql.gz"
docker compose -f $APP_DIR/docker-compose.prod.yml exec -T db \
  pg_dump -U progress progress | gzip > "\$BACKUP_FILE"
oci os object put \
  --bucket-name $BUCKET_NAME \
  --namespace-name $NAMESPACE \
  --name "backup-\$DATE.sql.gz" \
  --file "\$BACKUP_FILE" \
  --auth instance_principal
rm "\$BACKUP_FILE"
echo "Backup completed: backup-\$DATE.sql.gz"
PGBACKUP
chmod +x /usr/local/bin/pg-backup.sh

# Write crontab
(crontab -l 2>/dev/null || true; cat <<CRON
# DuckDNS: update IP every 5 minutes
*/5 * * * * /usr/local/bin/duckdns-update.sh >> /var/log/duckdns.log 2>&1

# Certbot: renew twice daily
0 0,12 * * * certbot renew --quiet --post-hook "docker compose -f $APP_DIR/docker-compose.prod.yml restart nginx"

# pg_dump backup: daily at 2 AM UTC
0 2 * * * /usr/local/bin/pg-backup.sh >> /var/log/pg-backup.log 2>&1
CRON
) | crontab -

echo "=== Cron jobs installed ==="
echo "=== Setup Complete: $(date) ==="
echo "=== App should be live at https://$DOMAIN ==="
```

- [ ] **Step 2: Verify the script has no obvious bash syntax errors**

```bash
bash -n /Users/e161739/ClaudeWorkspace/progress-app/infra/terraform/user_data.sh
echo "Syntax check exit: $?"
```
Expected: exit `0` (no output means no errors).

Note: `bash -n` checks syntax without executing. The Terraform template variables (`${duckdns_token}` etc.) will cause bash to report unset variable errors at runtime — this is expected since Terraform substitutes them before cloud-init runs. The `$${...}` (double-dollar) syntax in the heredocs escapes the `$` so Terraform does NOT substitute them (e.g. `$${DUCKDNS_SUBDOMAIN}` in the heredoc becomes `${DUCKDNS_SUBDOMAIN}` in the output script, which bash then evaluates).

- [ ] **Step 3: Re-run terraform validate to confirm user_data.sh is referenced correctly**

```bash
cd /Users/e161739/ClaudeWorkspace/progress-app/infra/terraform
terraform validate
```
Expected: `Success! The configuration is valid.`

- [ ] **Step 4: Commit**

```bash
git add infra/terraform/user_data.sh
git commit -m "feat: add cloud-init bootstrap script for OCI VM"
```

---

## Task 5: Deployment runbook + smoke test

**Files:**
- Modify: `infra/terraform/terraform.tfvars.example` (already committed — just verify it's complete)

This task is manual verification that the Terraform plan is coherent and the deployment runbook works.

- [ ] **Step 1: Copy and fill in terraform.tfvars**

```bash
cp /Users/e161739/ClaudeWorkspace/progress-app/infra/terraform/terraform.tfvars.example \
   /Users/e161739/ClaudeWorkspace/progress-app/infra/terraform/terraform.tfvars
```

Edit `terraform.tfvars` with real values:
- `tenancy_ocid` — from OCI Console → Profile → Tenancy
- `compartment_ocid` — from OCI Console → Identity → Compartments (use root compartment OCID = tenancy_ocid if unsure)
- `region` — your home region (e.g. `eu-frankfurt-1`)
- `ssh_public_key` — run `cat ~/.ssh/id_ed25519.pub` (or `id_rsa.pub`)
- `duckdns_token` — from duckdns.org after registering a subdomain
- `duckdns_subdomain` — just the name (e.g. `myprogress`, not the full URL)
- `repo_url` — your GitHub repo URL

- [ ] **Step 2: Run terraform plan**

```bash
cd /Users/e161739/ClaudeWorkspace/progress-app/infra/terraform
terraform plan -out=app.tfplan
```
Expected: plan shows ~13 resources to create, no errors. Review the plan output — it should list: VCN, internet gateway, route table, security list, subnet, instance, volume, volume attachment, object storage bucket, dynamic group, policy.

- [ ] **Step 3: Apply**

```bash
terraform apply app.tfplan
```
Expected output ends with:
```
Apply complete! Resources: 13 added, 0 changed, 0 destroyed.

Outputs:

instance_public_ip = "xxx.xxx.xxx.xxx"
object_storage_bucket_name = "progress-app-backups"
object_storage_namespace = "..."
ssh_command = "ssh ubuntu@xxx.xxx.xxx.xxx"
```

Note the `instance_public_ip`.

- [ ] **Step 4: Monitor cloud-init progress**

```bash
# Wait ~2 minutes for SSH to become available
sleep 120

# SSH into the VM
ssh ubuntu@<instance_public_ip>

# Watch setup log (runs ~10-15 minutes total)
sudo tail -f /var/log/progress-app-setup.log
```
Expected final lines:
```
=== Setup Complete: ...
=== App should be live at https://<subdomain>.duckdns.org ===
```

If you see errors, the log shows exactly which step failed.

- [ ] **Step 5: Verify the app is live**

```bash
# From your local machine
curl -L https://<subdomain>.duckdns.org/api/health
```
Expected: `{"status":"ok"}`

Open `https://<subdomain>.duckdns.org` in a browser — the dashboard should load.

- [ ] **Step 6: Verify Postgres data persistence**

```bash
# On the VM
ls -la /data/pgdata/
```
Expected: Postgres data files visible (base/, pg_wal/, etc.)

- [ ] **Step 7: Verify backup cron is installed**

```bash
# On the VM
crontab -l
```
Expected: 3 cron jobs listed (duckdns, certbot renew, pg-backup).

- [ ] **Step 8: Final commit with any last fixes**

If any files needed adjustment during deployment, commit them:
```bash
git add -A
git status  # review what changed
git commit -m "fix: deployment adjustments from smoke test"
```
If nothing changed: no commit needed.

---

## Updating the App (after initial deployment)

To deploy code changes to the live VM:
```bash
ssh ubuntu@<instance_public_ip>
cd /opt/progress-app
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

## Restoring from Backup

To restore a pg_dump backup from Object Storage:
```bash
# On the VM — list available backups
oci os object list --bucket-name progress-app-backups --namespace-name <ns> --auth instance_principal

# Download a backup
oci os object get --bucket-name progress-app-backups --namespace-name <ns> \
  --name backup-20260818-020000.sql.gz --file /tmp/restore.sql.gz --auth instance_principal

# Restore
gunzip -c /tmp/restore.sql.gz | docker compose -f /opt/progress-app/docker-compose.prod.yml \
  exec -T db psql -U progress progress
```
