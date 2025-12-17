# Freqtrade AWS MVP - CONTEXT

## Vision
- Construire un MVP gratuit de Bot-as-a-Service basé sur Freqtrade.
- Mode **DRY-RUN uniquement** pour éviter tout trade réel et rester dans le périmètre gratuit/sandbox.
- Priorité à la sécurité et à l'isolation : chaque client dans un environnement dédié (réseaux/volumes séparés).
- Infrastructure initiale en **EC2 + Docker Compose** pour aller vite, avec la possibilité de migrer vers **ECS/Fargate** plus tard pour l'élasticité et la gestion managée.

## Règles non négociables
- Aucun secret réel dans le dépôt. Utiliser des placeholders et des fichiers `.env.example`.
- Pas de trading réel : uniquement DRY-RUN. Les configurations client doivent forcer ce mode.
- Aucun bot client exposé sur Internet. Pas d'exposition de ports côté client.
- Le portail (interface de contrôle) n'écoute que sur `127.0.0.1` et est publié derrière Nginx.
- Pas d'accès direct au socket Docker depuis le portail : utiliser un **docker-socket-proxy** avec filtrage d'API minimal.
- Isolation stricte par client : réseau Docker par client + volumes dédiés par bot.
- Conteneurs durcis : utilisateur non-root si possible, `read_only` quand faisable, `cap_drop: ["ALL"]`, `no-new-privileges`.
- Documentation claire et scripts commentés pour simplifier l'onboarding et limiter les erreurs.

## Choix d'architecture
- **Compute** : EC2 avec Docker/Compose pour le MVP.
- **Réseau** : un réseau Docker principal `${DOCKER_NETWORK}` pour les services de contrôle (portal, proxy, base). Réseaux clients créés dynamiquement par client (`fta-client-<id>`).
- **Persistance** : Postgres pour stocker les métadonnées (état des clients, tokens), volumes dédiés pour chaque bot Freqtrade.
- **Sécurité** : Nginx en frontal (loopback uniquement) pour reverse-proxy vers le portail. Proxy Docker pour limiter les appels API. Paramètres de conteneur restrictifs.
- **Évolutivité** : scripts de provisionnement prêts pour migration future vers ECS/Fargate (même modèle réseau et séparation des workloads).
