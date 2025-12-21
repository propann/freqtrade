# Freqtrade AWS Portal

Backend portal for the SaaS control-plane. It is an Express app packaged in Docker and fronted by the existing Nginx reverse proxy.

## Layout
- `portal/placeholder/src/app.js`: Express app wiring, middlewares, and routes.
- `portal/placeholder/src/server.js`: Bootstraps the server and listens on the configured port.
- `portal/placeholder/src/routes/`: Route handlers (`/`, `/health`, `/api/*`).
- `portal/placeholder/src/services/`: Database helpers (PostgreSQL pool, tenant helpers).
- `portal/placeholder/public/`: Static assets (landing page styling/images if needed).

## Environment variables
| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP listen port. |
| `POSTGRES_HOST` | _required_ | PostgreSQL host. |
| `POSTGRES_PORT` | `5432` | PostgreSQL port. |
| `POSTGRES_DB` | _required_ | PostgreSQL database. |
| `POSTGRES_USER` | _required_ | PostgreSQL user. |
| `POSTGRES_PASSWORD` | _required_ | PostgreSQL password. |
| `CLIENTS_DIR` | `/data/clients` | Root folder for tenant assets (informational). |
| `DEFAULT_CPU` | `1.0` | Default CPU quota surfaced by the API. |
| `DEFAULT_MEM_LIMIT` | `1024m` | Default memory quota surfaced by the API. |
| `DEFAULT_PIDS_LIMIT` | `256` | Default PID limit surfaced by the API. |
| `PORTAL_ADMIN_TOKEN` | _unset_ | Optional token to secure admin APIs (`/api/*`). When unset, dev mode is permissive and logs a warning. |

## Endpoints
- `GET /` landing page with runtime status (env, uptime, git hash) and shortcuts to the API.
- `GET /health` database health probe (PostgreSQL `SELECT 1`).
- `GET /api/clients` (admin) list tenants and subscription status (legacy compatibility).
- `POST /api/clients/:id/provision` (admin) ensure tenant + subscription, audited.
- `POST /api/clients/:id/backtest` (admin) placeholder backtest trigger (requires active subscription).
- `POST /api/clients/:id/start` (admin) placeholder start trigger (requires active subscription).
- `POST /api/billing/webhook/paypal` PayPal webhook placeholder updating subscription status.
- `POST /api/tenants` (admin) create/update tenant + subscription. Body: `{ "id": "tenant-123", "email": "ops@example.com" }`.
- `GET /api/tenants/:id` (admin) fetch tenant and subscription metadata.

All admin endpoints require the `PORTAL_ADMIN_TOKEN` if it is set. Provide it via `Authorization: Bearer <token>` or `x-portal-admin-token`.

## Running locally
```bash
cd portal/placeholder
npm install
PORT=8080 POSTGRES_HOST=localhost POSTGRES_DB=freqtrade POSTGRES_USER=freqtrade POSTGRES_PASSWORD=secret npm start
```

### Docker
The `portal/placeholder/Dockerfile` builds the production image. Example:
```bash
cd portal/placeholder
docker build -t freqtrade-portal .
docker run --rm -p 8088:8080 \
  -e POSTGRES_HOST=postgres \
  -e POSTGRES_DB=freqtrade \
  -e POSTGRES_USER=freqtrade \
  -e POSTGRES_PASSWORD=secret \
  freqtrade-portal
```

## Debugging / logs
- Request IDs are attached to each response via the `x-request-id` header.
- Admin token dev mode logs a warning once when `PORTAL_ADMIN_TOKEN` is absent.
- Health check failures return structured JSON errors with details.

## Manual smoke tests (curl)
```bash
# Health
curl -i http://localhost:8080/health

# Admin-authenticated tenant creation
curl -i -X POST http://localhost:8080/api/tenants \
  -H "Authorization: Bearer $PORTAL_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"tenant-123","email":"ops@example.com"}'

# Fetch tenant details
curl -i http://localhost:8080/api/tenants/tenant-123 \
  -H "x-portal-admin-token: $PORTAL_ADMIN_TOKEN"
```
