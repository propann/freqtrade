# Sécurité

Ce logiciel pilote potentiellement un moteur de trading. Une fausse réussite, un secret exposé ou un endpoint non protégé peut coûter de l'argent réel.

## Garanties actuelles

- aucun identifiant, mot de passe ou JWT de secours n'est accepté par le code ;
- l'authentification refuse de démarrer si les variables requises manquent ;
- les routes conservées de contrôle et de logs exigent une session valide ; les anciennes routes de faux backtest et de collecte d'identifiants ont été supprimées ;
- le cookie de session est `HttpOnly`, `SameSite=Strict` et `Secure` en production ;
- le port REST Freqtrade n'est pas publié par le Compose ;
- l'exemple `.env.example` ne contient que des valeurs factices.
- les clés exchange et Telegram sont injectées dans Freqtrade depuis les secrets Coolify et ne transitent pas par Next.js.

## Limites critiques restantes

- la sécurité au repos dépend du coffre de secrets de la plateforme de déploiement ; la console refuse de collecter les clés ;
- aucune protection CSRF dédiée n'est encore implémentée ;
- aucune limitation de tentatives de connexion n'est présente ;
- la console n'est pas encore connectée au moteur réel et ne doit pas passer en live ;
- le proxy TLS et la restriction d'accès doivent être configurés dans Coolify ou sur l'hôte.

## Avant capital réel

1. Brancher les secrets Coolify, Docker secrets ou un coffre dédié sans les faire transiter par le navigateur.
2. Ajouter limitation de débit, verrouillage temporaire et journal d'authentification.
3. Ajouter protection CSRF aux mutations.
4. Tester les permissions de chaque route et les scénarios d'échec réseau.
5. Exiger une confirmation renforcée pour `force_exit`, `exit_all` et tout passage hors dry-run.
6. Faire relire le chemin d'exécution par une seconde personne.

Tout jeton collé dans un chat, une issue ou un log doit être révoqué puis remplacé avant déploiement.

Ne jamais ouvrir directement les ports 3000 ou 8080 à Internet sans TLS et contrôle d'accès en amont.
