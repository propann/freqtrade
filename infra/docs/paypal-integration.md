# Intégration PayPal (MVP)

## Ce qui est inclus
- Endpoint stub `POST /api/billing/webhook/paypal` dans le portail (voir `portal/placeholder/server.js`).
- Champ `status` dans la table `subscriptions` (`active | past_due | canceled`).
- Gating : provision/backtest refusés si `status != active`.

## Points d'extension
1. Créer une application PayPal et récupérer `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` (variables à renseigner dans `.env`).
2. Implémenter la validation des webhooks (vérification de la signature) avant de mettre à jour `subscriptions.status`.
3. Mapper les événements PayPal (ex: `BILLING.SUBSCRIPTION.ACTIVATED`, `...CANCELLED`, `...SUSPENDED`) vers `status`:
   - `ACTIVATED` -> `active`
   - `SUSPENDED` ou paiement échoué -> `past_due`
   - `CANCELLED` -> `canceled`
4. Stocker les métadonnées utiles dans `audit_logs` (sans secrets) : event id, subscription id, nouveau statut.
5. Protéger l'endpoint : limiter l'exposition réseau (derrière Nginx) et ajouter une authentification serveur-serveur si besoin (token partagé ou signature PayPal uniquement).

## Flux conseillé (MVP)
- Lors de l'inscription, créer un enregistrement `tenants` + `subscriptions` avec `status=past_due`.
- Quand PayPal renvoie le webhook d'activation, passer `status` à `active`.
- À chaque job (provision/backtest), vérifier le statut et refuser si non actif.
- Prévoir un cron ou un job planifié pour revalider les statuts (optionnel dans le MVP).
