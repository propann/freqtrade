# Freqtrade AWS PAYANT - CONTEXT

## Vision
- Construire un service PAYANT de Bot-as-a-Service basé sur Freqtrade pour des clients en France.
- Facturation mensuelle par abonnement (PayPal en MVP) avec possibilité de paliers basés sur la consommation (CPU/RAM/temps de jobs).
- Sécurité et isolation multi-clients en priorité : chaque client possède ses données et réseaux dédiés, aucun port client exposé.
- Infrastructure actuelle en **EC2 + Docker Compose** pour le déploiement simple (one-command boot), avec une trajectoire de migration vers **ECS/Fargate**.

## Règles non négociables
- Aucun secret réel dans le dépôt. Uniquement des placeholders et `.env.example`.
- Aucun bot client ou job exposé publiquement. Le portail écoute sur `127.0.0.1` et est servi via Nginx.
- Pas d'accès direct au socket Docker : utiliser **docker-socket-proxy** avec permissions minimales.
- Isolation stricte : réseaux par client, volumes dédiés, conteneurs durcis (`cap_drop: ["ALL"]`, `no-new-privileges`, quotas CPU/RAM/PIDs, `read_only` quand possible).
- Journalisation sans secrets en clair.

## Choix d'architecture
- **Compute** : EC2 avec Docker/Compose pour le MVP; migration prévue vers ECS/Fargate (modèle job éphémère conservé).
- **Réseau** : un réseau Docker de contrôle `${DOCKER_NETWORK}` pour le portail/proxy/base. Réseaux clients créés dynamiquement (`fta-client-<id>`).
- **Persistance** : Postgres pour les métadonnées (tenants, abonnements, audit). Volumes dédiés pour chaque bot/job.
- **Sécurité** : Nginx en frontal (loopback), docker-socket-proxy filtré, conteneurs durcis et quotas par défaut (CPU 1.0 / RAM 1024m / pids 256).
- **Exécution** : une action = un conteneur job éphémère (backtest/hyperopt/dry-run) par client. Les résultats sont écrits dans l'espace du client puis le conteneur s'arrête.
- **Facturation** : gating minimal via `subscriptions.status` (`active|past_due|canceled`). Le portail refuse provision/start/backtest si status != `active`.
