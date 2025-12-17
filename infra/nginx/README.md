# Nginx reverse proxy

Ce répertoire contient la configuration Nginx servant de frontal au portail.

- Le serveur écoute sur le port 80 uniquement (loopback côté host via la publication Docker).
- Proxy vers `127.0.0.1:${PORTAL_HTTP_PORT}` où tourne le portail.
- Commentaires inclus pour activer TLS (Let’s Encrypt) si besoin.
- Ne jamais exposer les services clients : seuls le portail et l'API interne sont derrière Nginx.
