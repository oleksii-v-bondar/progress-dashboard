# OCI Infrastructure — Design Spec

**Date:** 2026-08-18  
**Status:** Approved

---

## Overview

Deploy the progress-app (React + Express + PostgreSQL, Docker Compose) to Oracle Cloud Infrastructure (OCI) Free Tier for a single user. Provisioned via Terraform from a local machine. HTTPS via Let's Encrypt + DuckDNS free subdomain. Postgres data persisted on a separate OCI Block Volume with daily pg_dump backups to OCI Object Storage.

---

## Constraints

- 100% OCI Free Tier (no charges):
  - VM: `VM.Standard.A1.Flex`, 2 OCPU / 12 GB RAM (within free 4 OCPU / 24 GB/month allowance), Ubuntu 22.04 ARM
  - Block Volume: 50 GB (within free 200 GB total allowance)
  - Object Storage: standard bucket, daily pg_dump (within free 20 GB)
  - No OCI Load Balancer (Nginx handles SSL termination)
- Terraform executed locally — no CI/CD pipeline, no remote state backend
- DuckDNS free subdomain (e.g. `myprogress.duckdns.org`) — user must register at duckdns.org
- User owns an OCI account and has OCI CLI profile configured

---

## Architecture

```
Internet
  │  443/80
  ▼
VM public IP (A1.Flex, Ubuntu 22.04 ARM)
  │
  ├─ Nginx container (reverse proxy, TLS termination)
  │     ├─ /api/* → backend:4000
  │     └─ /*     → frontend nginx:80 (static files)
  │
  ├─ backend container  (node dist/index.js, port 4000)
  ├─ frontend container (nginx static, port 80)
  ├─ db container       (postgres:16-alpine, data on /data/pgdata)
  │
  └─ Block Volume mounted at /data
       └─ /data/pgdata  ← Postgres data directory

OCI Object Storage bucket  ← daily pg_dump cron (2 AM UTC)
DuckDNS cron               ← every 5 min, updates A record to VM public IP
Certbot cron               ← twice daily, renews Let's Encrypt cert
```

---

## Section 1 — OCI Infrastructure (Terraform)

**Resources provisioned:**

| Resource | Details |
|---|---|
| VCN | CIDR `10.0.0.0/16` |
| Public Subnet | CIDR `10.0.1.0/24`, public IP assignment enabled |
| Internet Gateway | Attached to VCN |
| Route Table | Default route `0.0.0.0/0` → Internet Gateway |
| Security List | Ingress: TCP 22, 80, 443; Egress: all |
| Compute Instance | `VM.Standard.A1.Flex`, 2 OCPU / 12 GB RAM, Ubuntu 22.04 ARM, SSH public key auth |
| Block Volume | 50 GB, same AD as instance |
| Block Volume Attachment | paravirtualized, attached to instance at `/dev/oracleoci/oraclevdb` |
| Object Storage Bucket | Standard, for pg_dump backups |

**Variables (`terraform.tfvars`, git-ignored):**

```hcl
tenancy_ocid     = "ocid1.tenancy.oc1...."
compartment_ocid = "ocid1.compartment.oc1...."
region           = "eu-frankfurt-1"   # or your region
ssh_public_key   = "ssh-ed25519 AAAA..."
duckdns_token    = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
duckdns_subdomain = "myprogress"
```

**Outputs (`outputs.tf`):**
- `instance_public_ip` — IP to point DuckDNS at (also used by cloud-init)
- `object_storage_bucket_name`

---

## Section 2 — App Deployment (cloud-init / user_data.sh)

Runs once on first boot. Steps:

1. Format and mount block volume at `/data`; add to `/etc/fstab`
2. `apt-get install -y docker.io docker-compose-plugin git certbot python3-certbot-dns-duckdns`
3. Clone repo: `git clone https://github.com/<user>/progress-app /opt/progress-app`
4. Generate `/opt/progress-app/.env.prod` with a random `DB_PASSWORD` (using `openssl rand`)
5. Write DuckDNS update script to `/usr/local/bin/duckdns-update.sh`; add cron: `*/5 * * * *`
6. Run DuckDNS update immediately to register the IP
7. Issue Let's Encrypt cert via DNS challenge:
   ```bash
   certbot certonly --dns-duckdns \
     --dns-duckdns-token <token> \
     -d <subdomain>.duckdns.org \
     --non-interactive --agree-tos -m admin@<subdomain>.duckdns.org
   ```
8. Write nginx config from template with correct domain name
9. Start stack: `docker compose -f /opt/progress-app/docker-compose.prod.yml up -d --build`
10. Add cron: `0 2 * * *` — pg_dump → gzip → upload to OCI Object Storage (`oci os object put`)
11. Add cron: `0 0,12 * * *` — `certbot renew --quiet`

**Note:** cloud-init runs as root. The OCI CLI on the VM is authenticated via Instance Principal (IAM policy grants the instance permission to write to the Object Storage bucket — Terraform provisions this policy).

---

## Section 3 — Nginx + HTTPS

**`nginx/nginx.conf`** (checked into repo):

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

    location /api/ {
        proxy_pass http://backend:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://frontend:80;
    }
}
```

`DOMAIN_PLACEHOLDER` is substituted with the actual subdomain by `user_data.sh` using `sed` before starting the stack.

Let's Encrypt cert directory (`/etc/letsencrypt`) is bind-mounted into the Nginx container.

---

## Section 4 — Production Dockerfiles

### `backend/Dockerfile.prod`

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY backend/package.json ./
RUN npm install
COPY backend/tsconfig.json ./
COPY backend/src/ ./src/
COPY shared/ ./shared/
RUN npx tsc

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY shared/ ./shared/
EXPOSE 4000
CMD ["node", "dist/index.js"]
```

### `frontend/Dockerfile.prod`

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

---

## Section 5 — docker-compose.prod.yml

```yaml
services:
  db:
    image: postgres:16-alpine
    env_file: .env.prod
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
    env_file: .env.prod
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

---

## Section 6 — File Structure

```
infra/
  terraform/
    main.tf
    variables.tf
    outputs.tf
    terraform.tfvars          # git-ignored
    terraform.tfvars.example  # committed template
    user_data.sh              # cloud-init bootstrap

backend/
  Dockerfile                  # existing (dev)
  Dockerfile.prod             # new (production)

frontend/
  Dockerfile                  # existing (dev)
  Dockerfile.prod             # new (production)

nginx/
  nginx.conf                  # reverse proxy config (DOMAIN_PLACEHOLDER)

docker-compose.yml            # existing (dev)
docker-compose.prod.yml       # new (production)
.env.prod.example             # committed template
```

**`.gitignore` additions:**
```
infra/terraform/terraform.tfvars
infra/terraform/.terraform/
infra/terraform/*.tfstate
infra/terraform/*.tfstate.backup
infra/terraform/*.tfplan
.env.prod
```

---

## Deployment Runbook (after `terraform apply`)

1. `cd infra/terraform && terraform init && terraform apply`
2. Note the output `instance_public_ip`
3. Log in to duckdns.org → set your subdomain to point at that IP (cloud-init will keep it updated after that)
4. Wait ~5 minutes for cloud-init to finish: `ssh ubuntu@<IP> tail -f /var/log/cloud-init-output.log`
5. Visit `https://<subdomain>.duckdns.org` — app should be live

---

## Out of Scope

- Multiple users / auth layer
- Automatic VM recreation / auto-scaling
- CI/CD pipeline for app updates (to update: `ssh` in, `git pull`, `docker compose -f docker-compose.prod.yml up -d --build`)
- OCI Load Balancer
- Custom domain (DuckDNS subdomain only)
