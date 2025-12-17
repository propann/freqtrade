# Nginx

Reverse-proxy minimal pour exposer le portail uniquement via `127.0.0.1:${PORTAL_HTTP_PORT}`. Le domaine public attendu est `freqtrade-aws.${PUBLIC_DOMAIN}`.

- Ajouter les certificats Let's Encrypt si besoin (voir commentaires dans `conf.d/freqtrade-aws.conf`).
- Aucune exposition directe des bots ou jobs clients ; seul le portail est routé.
