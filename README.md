# freqtrade-aws (SaaS multi-tenant)

Service payant par abonnement (PayPal en MVP) basé sur Freqtrade, opéré sur **EC2 + Docker Compose** avec trajectoire vers ECS/Fargate. Le dépôt ne modifie pas le cœur de Freqtrade : seules des surcouches et templates sont fournis. Aucune promesse ou garantie de gains financiers.

## Arborescence
- `orchestrator/` : API FastAPI multi-tenant (création/start/pause/restart/status/logs/audit).
- `console/` : UI Next.js dark mode pour piloter les bots.
- `infra/` : compose EC2, scripts, Nginx, docker-socket-proxy, utilitaires backup/restore/onboarding.
- `templates/` : modèles de config Freqtrade + validateurs de risque/quotas.
- `docs/` : architecture, sécurité, opérations, légal, coûts AWS, plan d'exécution.
- `clients/` : dossiers générés par tenant (configs, données, logs).

## Déploiement EC2 (Ubuntu)
1. Préparer l'hôte :
```bash
cd /opt
git clone <repo> freqtrade-aws && cd freqtrade-aws
infra/scripts/install-ec2.sh
```
2. Copier la configuration :
```bash
cp .env.example .env
# Renseigner PUBLIC_DOMAIN, PORTAL_HTTP_PORT, POSTGRES_*, PAYPAL_* (placeholders uniquement), JWT...
```
3. Démarrer l'infra :
```bash
infra/scripts/deploy.sh
```
4. Vérifier :
```bash
infra/scripts/status.sh
```
Le portail reste bindé en loopback (`127.0.0.1:${PORTAL_HTTP_PORT}`) et passe par Nginx.

## Orchestrateur FastAPI
```bash
cd orchestrator
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn orchestrator.app.main:app --reload --port 9000
```
Endpoints clés : création de tenant/bot, start/pause/restart, statut, logs, audit. Les actions sensibles exigent `subscription_status=active`.

## Console Next.js
```bash
cd console
npm install
npm run dev
```
La console consomme l'API orchestrateur, affiche Overview/Performance/Risk/Events/Actions sans exposer de secrets ni promettre de gains.

## Scripts utilitaires
- `infra/scripts/onboard-tenant.sh <id> <email>` : bootstrap tenant + appel API.
- `infra/scripts/backup-client.sh <id>` : archive `clients/<id>` + dump ciblé Postgres (sans secrets).
- `infra/scripts/restore-client.sh <id> <archive>` : restaure les fichiers + option de réimport meta.

## Rappels sécurité
- Aucun secret réel dans Git; utiliser AWS SSM/Secrets Manager pour injecter au runtime.
- Conteneurs durcis (`cap_drop: ["ALL"]`, `no-new-privileges`, quotas CPU/RAM/PIDs).
- Pas d'accès direct au socket Docker (utiliser docker-socket-proxy).
- Toujours privilégier le **dry-run** par défaut.

## Documentation détaillée (français)
- `docs/ARCHITECTURE.md` : vue d'ensemble des composants (orchestrateur, console Next.js, Postgres, docker-socket-proxy) et options ECS/Fargate.
- `docs/OPERATIONS.md` : prérequis EC2, déploiement Compose, gestion des bots et procédures de backup/restore.
- `docs/SECURITY.md` : principes d'isolation réseau, gestion des secrets AWS, durcissement des conteneurs et journalisation.
- `docs/AWS_COSTS.md` : estimation indicative des coûts (EC2, EBS, S3, Secrets Manager, SSM) et pistes d'optimisation.
- `docs/EXECUTION_PLAN.md` : feuille de route par étapes (baseline infra, orchestrateur, console, billing PayPal, migration Fargate).
- `docs/paypal.md` : statut d'abonnement, contrôle d'accès et webhook de synchronisation.
- `docs/pricing.md` : principes de tarification MVP et quotas associés aux plans 20/30/+.
