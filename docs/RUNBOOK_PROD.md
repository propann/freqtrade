# RUNBOOK PRODUCTION — Quant-Core

## Vérifications rapides
- Env fichier: `/etc/quant-core/quant-core.env` (chmod 600, root:root). Si absent: `sudo bash infra/scripts/install-env-prod.sh`.
- Stack active: `systemctl status quant-core` (attendu: active (running)). Logs systemd: `journalctl -u quant-core -f`.
- Le fichier `/etc/quant-core/quant-core.env` est un fichier dotenv (pas un script). Les valeurs contenant `$` sont supportées sans échappement; garder des quotes pour la lisibilité.

## Healthchecks
- Local (host): `curl -f http://127.0.0.1:8088/health`
- Public: `curl -f https://app.quant-core.app/health`
- Status global: `sudo bash infra/scripts/prod-status.sh --public-url https://app.quant-core.app/health`

## Déploiement / Recréation
```bash
cd /home/ubuntu/freqtrade
sudo bash infra/scripts/prod-deploy.sh               # pull + build + up -d + /health
sudo bash infra/scripts/prod-deploy.sh --no-pull     # si Git déjà à jour
```

## Restart propre
```bash
sudo bash infra/scripts/prod-restart.sh            # down + up -d --build + healthcheck
sudo bash infra/scripts/prod-restart.sh --no-build # si pas de code nouveau
```

## Logs
- Portal: `sudo bash infra/scripts/prod-logs.sh portal --tail 200`
- Nginx (container): `sudo bash infra/scripts/prod-logs.sh nginx --tail 200`
- Postgres: `sudo bash infra/scripts/prod-logs.sh postgres --tail 200`
- Nginx host: `sudo journalctl -u nginx -f` (reverse-proxy public)

## Debug checklist
- Ports: `ss -ltnp | grep -E '8088|80|443'` (nginx host reverse-proxy -> docker nginx -> portal:8088).
- DNS/TLS: `dig +short app.quant-core.app` et `curl -v https://app.quant-core.app/health`.
- Compose config: `docker compose -f infra/docker-compose.yml --env-file /etc/quant-core/quant-core.env config`.
- Certs host: `sudo nginx -t && sudo nginx -s reload` (si 502 côté host).
- Espaces: `df -h /` et `docker system df`.

## Rollback (git)
```bash
cd /home/ubuntu/freqtrade
git checkout <sha>
sudo bash infra/scripts/prod-deploy.sh --no-pull
git checkout main   # à faire après incident pour revenir sur la branche principale
```

## Incident 502
1) `curl -v http://127.0.0.1:8088/health` (portal local). Si KO: `sudo bash infra/scripts/prod-restart.sh`.
2) `sudo bash infra/scripts/prod-logs.sh nginx --tail 200` (nginx docker) puis `sudo journalctl -u nginx -f` (nginx host).
3) `sudo bash infra/scripts/prod-status.sh --public-url https://app.quant-core.app/health` pour confirmer le fix.

## Base de données down
1) `sudo docker ps | grep postgres` ou `sudo docker compose -f infra/docker-compose.yml --env-file /etc/quant-core/quant-core.env ps postgres`.
2) Restart ciblé: `sudo docker compose -f infra/docker-compose.yml --env-file /etc/quant-core/quant-core.env restart postgres`.
3) Si corruption: restaurer un dump récent via `sudo bash infra/scripts/prod-restore-db.sh --file /var/backups/quant-core/<dump>.sql.gz --yes`.

## Bug tenant
- Logs tenant: `sudo ls clients/<tenant>/logs` puis `sudo tail -n 200 clients/<tenant>/logs/*.log`.
- Recréation tenant (si données ok): `sudo bash infra/scripts/onboard-tenant.sh <tenant> <email>`.
- Vérif API admin: `sudo bash infra/scripts/test-admin.sh` puis `sudo bash infra/scripts/prod-smoke-test.sh`.

## Backup / Restore
- Dump: `sudo bash infra/scripts/prod-backup-db.sh --dir /var/backups/quant-core --retention-days 7`
- Restore: `sudo bash infra/scripts/prod-restore-db.sh --file /var/backups/quant-core/<dump>.sql.gz --yes`
- Dry run (intégrité): `gzip -t /var/backups/quant-core/<dump>.sql.gz`

## How to test localement sur l'EC2
```bash
cd /home/ubuntu/freqtrade
sudo bash infra/scripts/prod-status.sh
sudo bash infra/scripts/prod-smoke-test.sh --public-url https://app.quant-core.app/health
sudo bash infra/scripts/test-admin.sh
```
