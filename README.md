# freqtrade-aws (service payant, multi-clients)

MVP pour opérer des bots Freqtrade multi-clients sur AWS avec isolation forte, facturation par abonnement (PayPal) et déploiement simple via Docker Compose.

## Déploiement rapide sur EC2
1. Connectez-vous en SSH puis installez Docker/Compose et le pare-feu de base :
   ```bash
   sudo bash infra/scripts/install-ec2.sh
   ```
2. Placez le dépôt dans `/opt/freqtrade-aws` (ou clonez depuis votre dépôt privé) puis initialisez la configuration :
   ```bash
   cp .env.example .env
   # Éditez .env (POSTGRES_*, PORTAL_HTTP_PORT, PUBLIC_DOMAIN, quotas, placeholders PayPal)
   ```
3. Démarrez l'infra de contrôle (Postgres + docker-socket-proxy + portail + Nginx) :
   ```bash
   infra/scripts/deploy.sh
   ```
4. Configurez DNS pour `freqtrade-aws.${PUBLIC_DOMAIN}` pointant vers l'IP de l'instance. Le portail écoute uniquement sur `127.0.0.1:${PORTAL_HTTP_PORT}` et est publié par Nginx.

## Provisionner un client et lancer un backtest (mode job recommandé)
```bash
# Crée le réseau dédié, copie les templates et prépare les volumes
CLIENTS_DIR=$(pwd)/clients infra/scripts/provision-client.sh client1

# Lancer un backtest éphémère (refusé si abonnement non actif côté portail)
CLIENTS_DIR=$(pwd)/clients infra/scripts/run-backtest.sh client1 SampleStrategy 20220101-20220201
```

Commandes utiles :
- `infra/scripts/list-jobs.sh` : liste les conteneurs jobs en cours.
- `infra/scripts/suspend-client.sh <id>` : stoppe les jobs actifs d'un client.
- `infra/scripts/destroy-client.sh <id>` : supprime réseau + répertoire client (après suspension).
- `infra/scripts/status.sh` : état des services (compose).
- `infra/scripts/logs.sh [service]` : logs (par défaut `portal`).

## Sécurité et isolation
- Aucun secret réel dans Git (uniquement `.env.example`).
- Portail bind sur `127.0.0.1:${PORTAL_HTTP_PORT}`, publié via Nginx `freqtrade-aws.${PUBLIC_DOMAIN}`.
- docker-socket-proxy configuré avec permissions minimales (CONTAINERS/IMAGES/NETWORKS/VOLUMES/EVENTS/PING/VERSION/INFO=1, tout le reste=0).
- Pas d'exposition publique des bots/jobs ; un réseau Docker dédié par client (`fta-client-<id>`).
- Conteneurs durcis : `read_only`, `cap_drop: ["ALL"]`, `no-new-privileges`, limites `cpu=1.0`, `mem=1024m`, `pids=256` par défaut.
- Stratégies client considérées hostiles : chaque action = conteneur job éphémère qui écrit uniquement dans l'espace du client.
- Logs sans secrets en clair.

## Notes facturation PayPal (MVP gating)
- Statut d'abonnement stocké dans `subscriptions.status` (`active|past_due|canceled`).
- Le portail refuse provision/backtest si le statut n'est pas `active`.
- Variables `.env` : `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` (placeholders).
- Voir `infra/docs/paypal-integration.md` pour brancher les webhooks et mapper les statuts.

## Observabilité minimale
- Logs Docker accessibles via `infra/scripts/logs.sh`.
- Les résultats de backtest sont écrits dans `clients/<id>/data/results/<job_id>/`.

## Migration vers ECS/Fargate (préparation)
- Modèle déjà orienté « un job = un conteneur éphémère ».
- Quotas par plan faciles à mapper vers des tâches Fargate (CPU/Mem/PIDs ou TaskSize).
- docker-socket-proxy pourra être remplacé par des permissions IAM/ECS Task Role ; le portail resterait derrière un ALB interne.
