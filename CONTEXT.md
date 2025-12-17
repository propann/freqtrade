# Freqtrade AWS - CONTEXT

## Vision
- Construire un service **payant** de bots Freqtrade multi-clients, facturé par abonnement mensuel (PayPal) et basé sur la consommation (CPU/RAM/temps de job) pour des clients en France.
- Priorité absolue à la sécurité et à l'isolation : chaque client possède ses propres données, son réseau dédié et ses conteneurs durcis.
- MVP déployé simplement sur **AWS EC2 + Docker Compose** (one-command boot), avec une trajectoire claire vers **ECS/Fargate** pour l'élasticité ultérieure.

## Règles non négociables
- Aucun secret réel dans le dépôt : uniquement des placeholders et `.env.example`.
- Aucun bot client ou job exposé publiquement ; seul le portail est exposé via Nginx et bind sur `127.0.0.1`.
- Pas d'accès direct au socket Docker depuis le portail : utilisation obligatoire d'un **docker-socket-proxy** avec permissions minimales.
- Isolation stricte par client : réseau Docker dédié par client (`fta-client-<id>`), données séparées et conteneurs durcis (`no-new-privileges`, `cap_drop: ["ALL"]`, limites CPU/RAM/PIDs, `read_only` quand possible).
- Les stratégies clients sont considérées comme hostiles : chaque action (backtest/hyperopt/dry-run) doit tourner dans un conteneur job éphémère isolé.
- Logs sans secrets en clair.

## Choix d'architecture
- **Compute** : EC2 + Docker/Compose pour le MVP. Scripts d'installation et de déploiement simples pour réduire les erreurs d'exploitation.
- **Réseau** : réseau Docker principal `${DOCKER_NETWORK}` pour les services de contrôle (portal, proxy, base). Réseaux clients créés dynamiquement (`fta-client-<id>`), jamais exposés sur Internet.
- **Persistance** : Postgres pour les métadonnées (tenants, statut d'abonnement, journaux d'audit). Volumes dédiés pour les données Freqtrade de chaque client.
- **Sécurité** : Nginx en frontal (loopback uniquement) pour le portail ; docker-socket-proxy filtré ; conteneurs durcis ; quotas par défaut (`cpu=1.0`, `mem=1024m`, `pids=256`) et variantes par plan d'abonnement.
- **Évolutivité** : modèles et scripts alignés avec une migration future vers ECS/Fargate (tâches isolées, stockage dédié, ALB interne pour le portail, docker-socket-proxy remplacé par permissions IAM/ECS).
