# Environment Variables

- Prod: `/etc/quant-core/quant-core.env` (root:root, chmod 600). Copier via `sudo bash infra/scripts/install-env-prod.sh`.
- Dev/local: `.env` (copie de `.env.example`). Scripts chargent automatiquement `/etc/quant-core/quant-core.env` s'il existe.

Ce fichier est un `dotenv` (pas un script bash). Le loader ignore les commentaires, gère les quotes et n'expanse pas les `$`; ajouter des quotes autour des valeurs contenant `$` pour la lisibilité.

## Required
| Variable | Default/Example | Purpose |
| --- | --- | --- |
| PORTAL_INTERNAL_PORT | 8088 | Internal HTTP port for the portal container (`PORT` inside the container) targeted by nginx docker. |
| PORTAL_HTTP_PORT | 8088 | Host mapping for the nginx proxy (`127.0.0.1:PORTAL_HTTP_PORT -> portal:8088`). |
| PORTAL_JWT_SECRET | change-me | Secret for user JWTs. |
| PORTAL_ADMIN_TOKEN | change-me | Token required by the admin middleware; send as `X-Admin-Token` (preferred) or `Authorization: Bearer`. |
| ADMIN_EMAIL | admin@example.com | Admin account email. |
| ADMIN_PASSWORD | change-me | Plaintext admin password (only used by smoke tests). |
| ADMIN_PASSWORD_HASH | `$2a$10$examplehashvaluehere` | Bcrypt hash for the admin password. |
| ADMIN_TENANT_ID | admin | Tenant id bound to the admin user. |
| PORTAL_JWT_TTL | 12h | JWT time-to-live. |
| PORTAL_INTERNAL_URL | http://portal:8088 | Convenience URL for the portal container. |
| PORTAL_HOST_URL | http://127.0.0.1:8088 | Host URL used by scripts and smoke tests. |
| POSTGRES_HOST | postgres | Database host for the portal. |
| POSTGRES_PORT | 5432 | Database port. |
| POSTGRES_DB | freqtrade | Database name. |
| POSTGRES_USER | freqtrade | Database user. |
| POSTGRES_PASSWORD | freqtrade | Database password. |
| DOCKER_NETWORK | freqtrade-aws-net | Network name shared by services and client sessions. |
| CLIENTS_DIR | /app/clients | Writable root for tenant/session data (bind-mount to `../clients`). |
| TEMPLATES_DIR | /app/templates | Read-only templates directory inside the portal image. |
| DEFAULT_CPU | 1.0 | Default CPU quota passed to client compose files. |
| DEFAULT_MEM_LIMIT | 1024m | Default memory limit for clients. |
| DEFAULT_PIDS_LIMIT | 256 | Default PIDs limit for clients. |
| DOCKER_COMPOSE_BIN | docker | Binary used to run `docker compose` commands. |
| ORCHESTRATOR_DRY_RUN | true | When `true`, compose commands are logged instead of executed. |
| ORCHESTRATOR_URL | http://orchestrator:8090 | URL used by smoke tests and status checks. |
| PAYPAL_CLIENT_ID | (blank allowed) | PayPal client id (required by compose even if empty). |
| PAYPAL_CLIENT_SECRET | (blank allowed) | PayPal client secret (required by compose even if empty). |
| PAYPAL_WEBHOOK_ID | (blank allowed) | PayPal webhook id (required by compose even if empty). |

## Optional / helpers
| Variable | Default/Example | Purpose |
| --- | --- | --- |
| POSTGRES_URI | postgresql://freqtrade:freqtrade@postgres:5432/freqtrade | Helper URI for tools. |
| CLIENT_TEMPLATES_DIR | /opt/freqtrade-aws/clients/templates | Path used by client provisioning scripts. |
| JOB_TIMEOUT | 10m | Default timeout for orchestration jobs. |
| BACKUP_DIR | /data/backups | Root directory for backups. |
| DOCKER_HOST | tcp://docker-socket-proxy:2375 | Docker host used by the portal. |

### Notes
- The portal image exposes `8080/tcp`; nginx docker proxies to `portal:8088` and nginx host publishes `127.0.0.1:8088` to the reverse-proxy TLS vhost.
- Host directories `clients` and `logs` must exist and be writable by UID/GID `1000` (the `node` user inside the container): `mkdir -p clients logs && chown -R 1000:1000 clients logs`.
- Values with `$` or spaces are supported by the loader; quoting them (single or double) is recommended for clarity.

### Admin API auth
- Set `PORTAL_ADMIN_TOKEN` in `.env`.
- Send either `X-Admin-Token: $PORTAL_ADMIN_TOKEN` (preferred) or `Authorization: Bearer $PORTAL_ADMIN_TOKEN` on admin endpoints (`/api/tenants`, `/api/clients`, etc.).

### Onboard a tenant (runbook)
1. Vérifier l'environnement : `./infra/scripts/check-env.sh`
2. Onboard : `./infra/scripts/onboard-tenant.sh <tenant_id> <email>` (ex: `./infra/scripts/onboard-tenant.sh demo-1 user@example.com`)
   - Le script crée le répertoire client et enregistre le tenant via `POST /api/tenants` avec le header admin.
3. Vérifier l'accès admin : `./infra/scripts/test-admin.sh`
