# Sécurité

Ce logiciel pilote potentiellement un moteur de trading. Une fausse réussite, un secret exposé ou un endpoint non protégé peut coûter de l'argent réel.

## Garanties actuelles

- aucun identifiant, mot de passe ou JWT de secours n'est accepté par le code ;
- l'authentification refuse de démarrer si les variables requises manquent ;
- les routes conservées de contrôle et de logs exigent une session valide ; les anciennes routes de faux backtest et de collecte d'identifiants ont été supprimées ;
- le cookie de session est `HttpOnly`, `SameSite=Strict` et `Secure` en production ;
- le jeton signé est lié au propriétaire configuré, borné à sept jours et vérifié en temps constant ;
- huit échecs de connexion sur quinze minutes déclenchent un verrou temporaire local ;
- le port REST Freqtrade n'est pas publié par le Compose ;
- l'exemple `.env.example` ne contient que des valeurs factices.
- les clés exchange et Telegram sont injectées dans Freqtrade depuis les secrets Coolify et ne transitent pas par Next.js.
- les journaux publics sont limités et filtrés côté serveur pour les formes usuelles de secrets et les valeurs configurées.
- les réponses ajoutent CSP, anti-framing, `nosniff`, politique de référent stricte et désactivation des capteurs inutiles ; la route d'authentification est `no-store` et bornée à 4 Kio ;
- la sonde de santé ne révèle ni composant, ni version, ni détail de configuration.

## Limites critiques restantes

- Next.js `14.2.3` est ancien et inférieur au correctif `14.2.25` d'un avis critique ; migrer vers la branche maintenue incluant la publication de sécurité annoncée pour le 26 août 2026 avant exposition publique ;
- la sécurité au repos dépend du coffre de secrets de la plateforme de déploiement ; la console refuse de collecter les clés ;
- le limiteur de connexion vit en mémoire et convient à l'instance unique actuelle, pas à plusieurs réplicas ;
- les routes actuelles sont uniquement en lecture ; toute future mutation exigera un jeton CSRF dédié ;
- la console est connectée au moteur réel mais n'est pas encore validée sur le VPS et ne doit pas passer en live ;
- le proxy TLS et la restriction d'accès doivent être configurés dans Coolify ou sur l'hôte.

## Avant capital réel

1. Brancher les secrets Coolify, Docker secrets ou un coffre dédié sans les faire transiter par le navigateur.
2. Mettre à niveau Next.js vers une branche maintenue après la publication du correctif annoncé et refaire tests, lint et build.
3. Tester le verrouillage temporaire derrière le proxy Coolify et surveiller les réponses `429`.
4. Ajouter protection CSRF et confirmation renforcée avant toute mutation future.
5. Tester les permissions de chaque route et les scénarios d'échec réseau.
6. Exiger une confirmation renforcée pour `force_exit`, `exit_all` et tout passage hors dry-run.
7. Faire relire le chemin d'exécution par une seconde personne.

Références : [avis critique Middleware](https://github.com/vercel/next.js/security/advisories/GHSA-f82v-jwr5-mffw) et [calendrier de sécurité Next.js](https://nextjs.org/blog).

Tout jeton collé dans un chat, une issue ou un log doit être révoqué puis remplacé avant déploiement.

Ne jamais ouvrir directement les ports 3000 ou 8080 à Internet sans TLS et contrôle d'accès en amont.
