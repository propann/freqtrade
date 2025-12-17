# PayPal (MVP gating)

## MVP : statut stocké et vérifié
- Chaque tenant possède une entrée `subscriptions` avec un champ `status` (default `inactive`).
- L'API du portail bloque les actions sensibles (provision/start/backtest) si `status != active`.
- Le champ `plan` sert à différencier BASIC/PRO mais ne débloque rien tant que le statut n'est pas `active`.

## Webhook (évolution)
- Point d'entrée : `POST /api/billing/webhook/paypal` (payload PayPal à mapper vers un `subscription_id` interne).
- Mapping d'état recommandé :
  - `ACTIVE` -> `active`
  - `SUSPENDED` ou facture impayée -> `past_due`
  - `CANCELLED` -> `canceled`
- En cas de webhook valide : mise à jour de `subscriptions.status` + horodatage `updated_at` + ligne d'audit (`audit_logs`).

## Points de vigilance
- Ne jamais exposer les credentials PayPal dans les logs ou réponses HTTP.
- Refuser par défaut si le statut est inconnu ou manquant.
- Prévoir une tâche périodique qui vérifie les statuts PayPal vs base locale avant ouverture générale.
