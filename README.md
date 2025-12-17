# freqtrade-aws (Service payant)

Service de bots Freqtrade multi-clients sur AWS. Priorité : sécurité/isolation, déploiement simple (EC2 + Docker Compose), gating par abonnement PayPal (service payant avec facturation mensuelle). Les phases de test utilisent toujours des jobs en mode **DRY-RUN only**.

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
3) Démarrer l'infra :
```bash
infra/scripts/deploy.sh
```
4) Vérifier :
```bash
infra/scripts/status.sh
```
Le portail écoute sur `127.0.0.1:${PORTAL_HTTP_PORT}` et est publié via Nginx sur `freqtrade-aws.${PUBLIC_DOMAIN}`.

## Provisionner un client et lancer un backtest
```bash
CLIENTS_DIR=$(pwd)/clients infra/scripts/provision-client.sh client1
CLIENTS_DIR=$(pwd)/clients infra/scripts/run-backtest.sh client1 SampleStrategy 20230101-20230201
CLIENTS_DIR=$(pwd)/clients infra/scripts/list-jobs.sh client1
```
- Les jobs sont éphémères (1 job = 1 conteneur) et écrivent dans `clients/<id>/data/results/`.
- Aucun port client n'est exposé; réseau dédié `fta-client-<id>`.

## Sécurité et isolation
- docker-socket-proxy avec permissions minimales (aucun accès build/exec/etc.).
- Portail bindé en loopback + Nginx en frontal.
- Conteneurs durcis : `cap_drop: ["ALL"]`, `no-new-privileges`, quotas par défaut (`cpu=1.0`, `mem=1024m`, `pids=256`).
- Pas de secrets en clair dans les logs.

## Billing (MVP gating)
- Tables `tenants`, `subscriptions`, `audit_logs` (voir `portal/placeholder/db.sql`).
- `subscriptions.status` par défaut = `inactive`; l'accès provision/backtest est refusé tant que le statut n'est pas `active`.
- Webhook PayPal stub : `/api/billing/webhook/paypal` pour mettre à jour les statuts.
- Notes détaillées dans `docs/paypal.md`.

## Pricing notes
Méthode de calcul et exemples de plans BASIC/PRO dans `docs/pricing.md`.

## Migration Fargate (préparation)
- Modèle job éphémère conservé (1 tâche Fargate par job).
- docker-socket-proxy remplacé par IAM Task Role + API ECS.
- Volumes EFS/FSx par client pour persister les résultats.
