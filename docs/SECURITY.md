# Sécurité (prod)

## Ports ouverts minimum (SG AWS / host)
- 80/443 (TCP) depuis Internet -> nginx host (reverse-proxy public).
- SSH restreint (source IP allowlist). GitHub via SSH 443 (voir OPERATIONS.md) si nécessaire.
- Pas d'exposition directe du port 8088 : il reste en loopback (`127.0.0.1:8088`) pour nginx host.

## UFW / Firewall host
- Si UFW activé : `sudo ufw allow 80,443/tcp`, `sudo ufw allow from <admin_ip> to any port 22 proto tcp`, `sudo ufw enable`.
- Vérifier: `sudo ufw status numbered`. Les règles Docker doivent conserver l'accès loopback (127.0.0.1:8088).

## Nginx host vs nginx docker
- Nginx host : termine TLS, sert de reverse-proxy public (`/etc/nginx/sites-enabled/...`), envoie le trafic vers `http://127.0.0.1:8088`.
- Nginx docker (infra/nginx) : proxy interne `8080 -> portal:8088` dans le réseau compose `control`. Ne jamais exposer directement sur Internet.
- Vérification rapide : `sudo journalctl -u nginx -f` (host) et `sudo bash infra/scripts/prod-logs.sh nginx` (docker).

## Secrets
- Emplacement prod: `/etc/quant-core/quant-core.env` (root:root, chmod 600). Jamais de secrets dans Git.
- Rotation: `sudo bash infra/scripts/prod-rotate-secrets.sh` (renouvelle `PORTAL_JWT_SECRET` + `PORTAL_ADMIN_TOKEN`, puis redémarre la stack).
- Droits: `ls -l /etc/quant-core/quant-core.env` doit afficher `-rw------- root root`.

## Conteneurs et réseau
- Réseau `control` dédié aux services core. Nginx docker publie uniquement sur loopback host.
- `docker-socket-proxy` expose uniquement les API nécessaires (containers/images/networks/volumes/events/ping/version/info).
- Portal tourné en mode restreint: `read_only: true`, `cap_drop: ALL`, `no-new-privileges`.

## Logs / PII
- Journaux portal/nginx/postgres accessibles via `prod-logs.sh`, sans inclusion volontaire de secrets.
- Journalctl/CloudWatch: s'assurer que la rétention est configurée pour éviter les fuites prolongées.
