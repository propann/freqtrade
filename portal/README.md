# Portail (placeholder)

Ce portail Node.js est un placeholder sécurisé pour orchestrer le provisionnement et les jobs Freqtrade côté clients. Il n'inclut aucun secret ni logique métier finale, mais expose les points d'extension nécessaires :

- `/health`
- `/api/clients` (liste mockée)
- `/api/clients/:id/provision` (refuse si statut d'abonnement != `active`)
- `/api/clients/:id/backtest` (refuse si statut d'abonnement != `active`)
- `/api/billing/webhook/paypal` (stub pour brancher les webhooks PayPal)

Principes de sécurité :
- Bind uniquement sur `127.0.0.1:${PORTAL_HTTP_PORT}` (via `infra/docker-compose.yml`).
- Accès Docker via `docker-socket-proxy` (pas de socket brut) pour déclencher des jobs éphémères.
- Conteneur durci : `read_only`, `tmpfs /tmp`, `cap_drop: ["ALL"]`, `no-new-privileges`.
- Aucun secret dans le code ; toutes les variables sensibles sont des placeholders et doivent être injectées via `.env`.

Pour développer le vrai portail, utiliser `portal/placeholder/server.js` comme base et brancher Postgres (voir `db.sql`), PayPal (voir `infra/docs/paypal-integration.md`), et la logique de provisioning réelle.
