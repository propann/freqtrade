# freqtrade-aws (Service payant)

Service PAYANT par abonnement PayPal mensuel. AWS est en phase free-tier/crédit pour nous au début. Priorité : sécurité/isolation, déploiement simple (EC2 + Docker Compose), gating par abonnement PayPal. Les phases de test utilisent toujours des jobs en mode **DRY-RUN only**.

## Déploiement sur EC2 (Ubuntu)
1) Préparer l'hôte (root/sudo) :
```bash
cd /opt
# Cloner le dépôt (ne jamais commiter de secrets)
# git clone <repo> freqtrade-aws && cd freqtrade-aws
infra/scripts/install-ec2.sh
```
2) Copier la configuration :
```bash
cp .env.example .env
# Éditer .env pour PUBLIC_DOMAIN, PORTAL_HTTP_PORT, POSTGRES_*, PAYPAL_*, JWT...
```
3) Démarrer l'infra (produit PAYANT, phase test en mode DRY-RUN only) :
```bash
infra/scripts/deploy.sh
```
4) Vérifier :
```bash
infra/scripts/status.sh
```
Le portail écoute sur `127.0.0.1:${PORTAL_HTTP_PORT}` et est publié via Nginx sur `freqtrade-aws.${PUBLIC_DOMAIN}`.

## Provisionner un client et lancer un backtest (MVP payant)
```bash
CLIENTS_DIR=$(pwd)/clients infra/scripts/provision-client.sh client1
CLIENTS_DIR=$(pwd)/clients infra/scripts/run-backtest.sh client1 SampleStrategy 20230101-20230201
CLIENTS_DIR=$(pwd)/clients infra/scripts/list-jobs.sh client1
```
- Les jobs sont éphémères (1 job = 1 conteneur) et écrivent dans `clients/<id>/data/results/`.
- Aucun port client n'est exposé; réseau dédié `fta-client-<id>`.

Commandes de vérification rapide :
- Provision : `CLIENTS_DIR=$(pwd)/clients infra/scripts/provision-client.sh <client_id>`
- Backtest : `CLIENTS_DIR=$(pwd)/clients infra/scripts/run-backtest.sh <client_id> [strategie] [timerange]`
- Jobs : `CLIENTS_DIR=$(pwd)/clients infra/scripts/list-jobs.sh <client_id>`

## Billing (MVP gating)
- Le produit est payant dès le MVP : l'accès aux actions sensibles (provision/start/backtest) requiert `subscriptions.status = active`.
- Le portail applique un refus clair (`HTTP 402 Payment Required`) si l'abonnement n'est pas actif (402/403 selon contexte d'erreur).
- PayPal mensuel est le moyen de paiement MVP (gating via `subscription_status`).
- Schéma minimal : tables `tenants`, `subscriptions`, `audit_logs` (voir `portal/placeholder/db.sql`).
- Webhook PayPal stub : `/api/billing/webhook/paypal` pour mettre à jour les statuts.
- Notes détaillées dans `docs/paypal.md`.

## Pricing (méthode consommation)
- Calcul basé sur la consommation (CPU/RAM/temps des jobs) + stockage + marge opérateur.
- Exemples de paliers indicatifs (Plan 20/30/+) dans `docs/pricing.md`, sans coûts AWS détaillés.
- `clients/<id>/data` contient les configs et résultats; la facturation stockage se base sur ce dossier.

## Sécurité et isolation
- docker-socket-proxy avec permissions minimales (aucun accès build/exec/etc.).
- Portail bindé en loopback + Nginx en frontal.
- Conteneurs durcis : `cap_drop: ["ALL"]`, `no-new-privileges`, quotas par défaut (`cpu=1.0`, `mem=1024m`, `pids=256`).
- Pas de secrets en clair dans les logs.

## Migration Fargate (préparation)
- Modèle job éphémère conservé (1 tâche Fargate par job).
- docker-socket-proxy remplacé par IAM Task Role + API ECS.
- Volumes EFS/FSx par client pour persister les résultats.
