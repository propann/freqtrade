# Architecture produit (EC2 Docker-first)

Objectif : opérer plusieurs bots Freqtrade isolés dans un modèle SaaS sans modifier le cœur du projet. L'infrastructure cible est EC2 + Docker Compose, avec une trajectoire documentée vers ECS Fargate.

## Vue d'ensemble
- **Orchestrateur FastAPI** : API de gestion des bots (création/start/pause/restart/status/logs/audit), contrôle des quotas et génération de configuration à partir de templates.
- **Console web (Next.js)** : UI dark theme consommant l'orchestrateur. Aucun secret ni promesse de gains financiers.
- **Infra EC2 + Docker Compose** : réseau `control` pour le portail + proxy, réseaux dédiés `fta-client-<id>` pour les conteneurs clients.
- **Postgres** : métadonnées tenants / abonnements / audit.
- **docker-socket-proxy** : surface minimale pour piloter les conteneurs sans accès direct au socket.
- **AWS SSM/Secrets Manager** : injection runtime des secrets d'échange / telegram / clés API.

## Flux principal
1. **Onboarding tenant** : création dans Postgres et via l'orchestrateur (`POST /tenants`).
2. **Validation abonnement** : l'orchestrateur bloque les actions sensibles si `subscription_status != active`.
3. **Création de bot** : génération de config depuis `templates/`, application des validateurs de risque, écriture dans l'espace isolé du tenant.
4. **Démarrage** : lancement d'un conteneur Freqtrade dans le réseau dédié, avec secrets injectés via SSM/Secrets Manager et quotas CPU/RAM/PIDs appliqués par Docker.
5. **Supervision** : logs contrôlés (sans secrets), audit trail stocké, métriques récupérées via REST.
6. **Jobs éphémères** : backtests/hyperopt créés comme conteneurs jetables, résultats persistés dans `clients/<id>/data/results`.

## Option ECS Fargate
- La logique d'orchestration reste identique : chaque action démarre une tâche Fargate avec IAM Task Role.
- Stockage : EFS par tenant pour la persistance des résultats.
- Remplacement du docker-socket-proxy par l'API ECS + EventBridge pour le suivi.
