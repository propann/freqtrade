# Sécurité et isolation

## Principes
- **Aucun secret dans Git** : seuls des placeholders figurent dans les templates et `.env.example`.
- **Isolation réseau** : réseau `control` pour le portail, réseau `fta-client-<id>` par tenant.
- **docker-socket-proxy** : exposition minimale (containers/images/networks/volumes/events/ping/version/info uniquement).
- **Durcissement des conteneurs** : `cap_drop: ["ALL"]`, `no-new-privileges`, `read_only` quand possible, quotas CPU/RAM/PIDs appliqués par défaut.
- **Logs sans secrets** : filtres côté orchestrateur pour éviter l'impression de clés API.
- **Audit** : chaque action (create/start/pause/restart) est journalisée avec l'acteur et l'horodatage.

## Secrets AWS
- **SSM Parameter Store** pour les clés API d'échange par tenant/bot.
- **Secrets Manager** pour les tokens sensibles (Telegram, webhooks).
- Injection au runtime via les entrées d'environnement du conteneur ou montée de fichiers.

## AuthN/AuthZ
- JWT côté portail (non inclus ici) pour identifier l'utilisateur.
- L'orchestrateur applique un contrôle de statut d'abonnement (`active`) avant toute action sensible.

## Sauvegarde/restauration
- Scripts dédiés (`infra/scripts/backup-client.sh`, `restore-client.sh`) pour copier `clients/<id>` et les métadonnées Postgres.
- Les dumps sont chiffrés côté opérateur avant stockage (S3 SSE-KMS recommandé, hors dépôt Git).
