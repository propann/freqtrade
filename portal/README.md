# Portail (placeholder)

Portail Node/Express minimal pour le MVP PAYANT. Il expose des endpoints stub et applique un gating strict : toutes les actions sensibles nécessitent un abonnement `active`.

- Bind uniquement sur `127.0.0.1:${PORTAL_HTTP_PORT}` (via le docker-compose racine).
- Accès Docker uniquement via `docker-socket-proxy` (pas d'accès direct au socket).
- Conteneur durci : `read_only`, `cap_drop: ["ALL"]`, `no-new-privileges`, `tmpfs`.
- Base Postgres pour stocker tenants (id/email), subscriptions (status `inactive|active|past_due|canceled`, plan) et audit logs (action/ts/meta) — voir `db.sql`.

## Endpoints exposés (stub)
- `GET /health`
- `GET /api/clients`
- `POST /api/clients/:id/provision` (refus si `status != active`)
- `POST /api/clients/:id/backtest` (refus si `status != active`)
- `POST /api/clients/:id/start` (refus si `status != active`)
- `POST /api/billing/webhook/paypal`

## Build local
```bash
cd portal/placeholder
npm ci --ignore-scripts   # nécessite l'accès au registre npm
npm start
```

Remplacer progressivement ce placeholder par le vrai portail applicatif.
