# Intégration PayPal (MVP)

## Objectif
- Utiliser PayPal pour gérer les abonnements mensuels.
- Pas d'implémentation complète dans le repo : uniquement les points d'extension et le mapping d'état.

## Points d'entrée
- Endpoint webhook : `POST /api/billing/webhook/paypal`
- Variables d'environnement attendues : `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`
- Table `subscriptions` : champ `status` (`active`, `past_due`, `canceled`)

## Workflow recommandé
1. Création d'abonnement dans PayPal (page Checkout hébergée côté portail/front). Stocker `subscriptions.id` avec l'id PayPal.
2. À chaque webhook `PAYMENT.SALE.COMPLETED` ou `BILLING.SUBSCRIPTION.ACTIVATED`, mettre `status=active`.
3. En cas d'échec de paiement ou annulation (`BILLING.SUBSCRIPTION.CANCELLED`), mettre `status=past_due` ou `canceled`.
4. Le portail refuse provision/backtest si `status != active`.

## Validation Webhook
- Vérifier l'en-tête `PAYPAL-TRANSMISSION-ID`/`PAYPAL-CERT-URL` via l'API PayPal (placeholder dans `server.js`).
- Journaliser l'événement dans `audit_logs` sans stocker de secrets.

## Points d'extension
- Ajouter une tâche cron/queue pour revérifier l'état des abonnements expirés.
- Connecter un système de tickets/support lors des transitions `past_due`.
- Ajouter un mapping de quotas par plan (`subscriptions.plan`).
