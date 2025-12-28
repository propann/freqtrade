# Backups & Restore (Postgres)

- Toujours exécuter depuis `/home/ubuntu/freqtrade`. Si nécessaire, exporter l'env: `set -a; source /etc/quant-core/quant-core.env; set +a`.

## Backup (dump compressé)
- Commande standard (retention 7 jours) :
```bash
sudo bash infra/scripts/prod-backup-db.sh --dir /var/backups/quant-core --retention-days 7
```
- Sortie: `/var/backups/quant-core/YYYYMMDD-HHMMSS.sql.gz`
- Retention: `find ... -mtime +<n>` exécuté par le script (suppression silencieuse des dumps trop anciens).

## Restore pas-à-pas
```bash
cd /home/ubuntu/freqtrade
sudo bash infra/scripts/prod-restore-db.sh --file /var/backups/quant-core/<dump>.sql.gz --yes
```
- Le script arrête portal/nginx (sauf `--skip-stop`), applique le dump sur `${POSTGRES_DB}`, puis relance.
- Vérifier l'état ensuite: `sudo bash infra/scripts/prod-smoke-test.sh --public-url https://app.quant-core.app/health`

## Test restore (dry run)
1. Vérifier l'archive: `gzip -t /var/backups/quant-core/<dump>.sql.gz`
2. Restaurer dans une base jetable pour contrôle (pas d'impact prod) :
```bash
TMPDB=restore_check_$(date +%s)
sudo docker compose -f infra/docker-compose.yml --env-file /etc/quant-core/quant-core.env exec -T \
  -e PGPASSWORD="${POSTGRES_PASSWORD}" \
  postgres psql -U "${POSTGRES_USER}" -d postgres -c "CREATE DATABASE ${TMPDB};"
sudo bash infra/scripts/prod-restore-db.sh --file /var/backups/quant-core/<dump>.sql.gz --database "${TMPDB}" --yes --skip-stop
sudo docker compose -f infra/docker-compose.yml --env-file /etc/quant-core/quant-core.env exec -T \
  postgres psql -U "${POSTGRES_USER}" -d postgres -c "DROP DATABASE ${TMPDB};"
```
3. Si la restauration test échoue, ne pas déployer en prod et investiguer l'archive.
