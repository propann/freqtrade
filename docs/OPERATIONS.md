# Opérations (EC2)

## Répertoires clefs
- Code: `/home/ubuntu/freqtrade`
- Secrets prod: `/etc/quant-core/quant-core.env` (root:root, 600). Copier via `sudo bash infra/scripts/install-env-prod.sh`.
- Données: `clients/` (un sous-dossier par tenant) et `logs/` (bind-mount dans les conteneurs portal). Vérifier présence/permissions: `sudo bash infra/scripts/check-env.sh`.
- Backups: `/var/backups/quant-core/*.sql.gz` (dump Postgres).

## Rotation des logs
- Docker (json-file) non roté par défaut. Recommandé: `/etc/docker/daemon.json` :
```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "5" }
}
```
Relancer docker: `sudo systemctl restart docker`.
- Nginx host: journalctl gère la rotation (journald). Pour fichiers access/error personnalisés, ajouter une entrée logrotate dédiée.

## Politique de tokens (JWT/admin)
- `PORTAL_JWT_SECRET` et `PORTAL_ADMIN_TOKEN` vivent uniquement dans `/etc/quant-core/quant-core.env` (jamais Git).
- Rotation: `sudo bash infra/scripts/prod-rotate-secrets.sh` (redéploie le portail). Effet: reconnexion utilisateur + mise à jour des scripts admin.
- Toujours passer le token admin en header `X-Admin-Token` (ou `Authorization: Bearer`).

## Convention de nommage tenants
- Format recommandé: `client-<nom>-<env>` ex. `client-azoth-prod`, `client-azoth-staging`.
- Caractères autorisés: `[a-z0-9-]`, commencer par une lettre, longueur < 32.
- Les dossiers dans `clients/` reprennent exactement l'identifiant tenant.

## GitHub via SSH port 443 (port 22 bloqué)
Ajouter à `~/.ssh/config` :
```
Host github.com
  HostName ssh.github.com
  User git
  Port 443
  IdentityFile ~/.ssh/id_ed25519
```
Tester: `ssh -T git@github.com`.
