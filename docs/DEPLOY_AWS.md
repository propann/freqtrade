# Déploiement AWS (Nginx système + Docker services)

## Architecture
- **Nginx système (Ubuntu)** : unique reverse-proxy exposé sur 80/443 avec SSL.
- **Docker Compose** : services internes uniquement (portal, postgres, docker-socket-proxy, bots à venir).
- **Portail** : bind en loopback (`127.0.0.1:${PORTAL_HTTP_PORT:-8088}`) et proxifié par Nginx.

## Variables d'environnement
Copiez `.env.example` vers `.env` et ajustez les valeurs (aucun secret dans Git).

Variables clés :
- `DOCKER_NETWORK` : réseau Docker partagé (défaut `freqtrade-aws-net`).
- `POSTGRES_*` : accès Postgres (host interne `postgres`).
- `PORTAL_HTTP_PORT` : port loopback exposé pour Nginx (défaut `8088`).
- `PORTAL_JWT_SECRET` : secret JWT portail.
- `PORTAL_ADMIN_TOKEN` : token admin pour `/api/admin/*`.
- `CLIENTS_DIR` : racine des dossiers clients (défaut `/data/clients`).
- `DEFAULT_CPU`, `DEFAULT_MEM_LIMIT`, `DEFAULT_PIDS_LIMIT` : limites par défaut.

## Lancer / reconstruire
```bash
cd infra

docker compose up -d --build
```

## Vérifications rapides
```bash
# Healthcheck (via loopback, proxifié ensuite par Nginx)
curl -i http://127.0.0.1:${PORTAL_HTTP_PORT:-8088}/health

# Landing page
curl -i http://127.0.0.1:${PORTAL_HTTP_PORT:-8088}/

# Bootstrap session dry-run (admin)
curl -i -X POST http://127.0.0.1:${PORTAL_HTTP_PORT:-8088}/api/admin/sessions \
  -H "Authorization: Bearer $PORTAL_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"azoth","configTemplate":"dryrun"}'
```

## Notes Nginx
- Le Nginx système proxifie `127.0.0.1:${PORTAL_HTTP_PORT}`.
- Le container Nginx Docker n'est plus nécessaire et ne doit pas exposer 80/443.
