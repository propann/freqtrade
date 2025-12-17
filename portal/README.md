# Portail (placeholder)

Le portail est un service minimal permettant de gérer les environnements clients (provisionnement, démarrage, suspension). 
Pour le MVP, il s'agit d'une image placeholder (`ghcr.io/dummy/portal-placeholder`) qui expose un serveur HTTP sur le port 8080.

Principes de sécurité :
- Bind uniquement sur `127.0.0.1:${PORTAL_HTTP_PORT}` (via le `docker-compose` racine).
- Accès au Docker API via `docker-socket-proxy` uniquement, pas d'accès direct au socket.
- Conteneur durci : `read_only`, `cap_drop: ["ALL"]`, `no-new-privileges`.

Remplacer l'image placeholder par le vrai portail applicatif lors de la phase suivante.
