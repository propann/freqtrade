# freqtrade-aws (MVP Bot-as-a-Service)

MVP gratuit pour opérer des bots Freqtrade en **DRY-RUN uniquement**, avec un focus sécurité/isolation. Infrastructure basée sur Docker Compose (EC2) et prête à migrer vers ECS/Fargate.

## Démarrage rapide
1. Copier `.env.example` vers `.env` et adapter les valeurs (pas de secrets réels dans le repo).
2. Démarrer l'infra de contrôle :
   ```bash
   docker compose -f infra/docker-compose.yml --env-file .env up -d
   ```
3. Provisionner un client :
   ```bash
   CLIENTS_DIR=$(pwd)/clients infra/scripts/provision-client.sh client1
   ```
4. Démarrer le bot du client (DRY-RUN) :
   ```bash
   CLIENTS_DIR=$(pwd)/clients infra/scripts/start-client.sh client1
   ```

Le portail (placeholder) écoute sur `127.0.0.1:${PORTAL_HTTP_PORT}` et est publié par Nginx sur `freqtrade-aws.${PUBLIC_DOMAIN}` (port 80). Aucun port des clients n'est exposé.

## Sécurité et isolation
- DRY-RUN forcé dans les templates clients.
- Un réseau Docker dédié par client (`fta-client-<id>`).
- Accès Docker filtré via `docker-socket-proxy` (pas de socket brut exposé).
- Conteneurs durcis (`read_only`, `cap_drop ALL`, `no-new-privileges`).

## Migration future
- Architecture conçue pour être portée sur ECS/Fargate (réseaux isolés par tâche, stockage EFS/volumes par client, ALB interne pour le portail).
