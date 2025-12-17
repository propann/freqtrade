# PayPal gating (MVP)

## MVP : subscription_status
- Chaque client possède une ligne `subscriptions` avec `tenant_id`, `plan`, `status` (`inactive|active|past_due|canceled`).
- Le portail refuse provision/start/backtest tant que le statut n'est pas `active` (HTTP 402 Payment Required avec message explicite).
- La mise à jour du statut peut être manuelle dans le MVP (back-office ou requête SQL) tant que le paiement PayPal n'est pas branché.

## Futur : webhook PayPal
- Brancher le webhook PayPal de facturation récurrente et mapper les évènements vers `subscriptions.status`.
- Mapping attendu :
  - `ACTIVE` -> `active`
  - `PAST_DUE` -> `past_due`
  - `CANCELLED`/`SUSPENDED` -> `canceled`
- Stocker l'horodatage de mise à jour (`updated_at`) et un log d'audit (`audit_logs`) pour chaque changement.
- Conserver le même gating métier : toute action sensible reste bloquée si le statut n'est pas `active`.
