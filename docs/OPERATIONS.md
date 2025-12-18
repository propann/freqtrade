# Opérations (EC2 + Docker Compose)

## Pré-requis EC2
- Ubuntu 22.04 LTS, sécurité renforcée (firewall limité, accès SSH restreint).
- Docker + docker-compose installés via `infra/scripts/install-ec2.sh`.
- Fichier `.env` dérivé de `.env.example` (aucun secret réel dans Git).

## Déploiement
```bash
infra/scripts/deploy.sh
```
- Lancement des services : Postgres, docker-socket-proxy, portail placeholder, Nginx.
- Le portail reste bindé en loopback (`127.0.0.1`).

## Gestion des bots
- Provision `POST /tenants/{id}/bots` (requiert subscription active).
- Start/pause/restart via endpoints publics orchestrateur ou via la console.
- Les conteneurs bots utilisent le réseau `fta-client-<id>` et montent `clients/<id>/configs` + `clients/<id>/data`.

## Sauvegarde / Restauration
- `infra/scripts/backup-client.sh <tenant_id>` : archive `clients/<id>` + dump ciblé Postgres (metadata tenant/audit).
- `infra/scripts/restore-client.sh <tenant_id> <archive.tar.gz>` : restaure les fichiers et recharge le dump.

## Journalisation
- Logs applicatifs orchestrateur/portail : stdout -> `docker logs` (sans secrets).
- Logs bots : conservés dans `clients/<id>/logs`. Pas de diffusion externe par défaut.

## Migration ECS/Fargate (option)
- Remplacer docker-compose par des tâches Fargate (1 tâche = 1 bot ou 1 job éphémère).
- Secrets injectés via IAM Task Role + secrets ECS.
- Réseau par tâche via VPC/Subnets isolés.
