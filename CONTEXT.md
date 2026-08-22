# Contexte projet

## Direction

Quant Core doit devenir une console Freqtrade simple à déployer sur Coolify, un VPS ou un Raspberry Pi 5. Une seule interface est maintenue : la console Next.js `console/`.

## Règles de travail

- Le dry-run reste le mode par défaut jusqu'à validation complète du chemin réel.
- Aucun secret ou identifiant de secours dans Git.
- Une donnée simulée doit être explicitement identifiée comme simulée.
- Une action affichée comme réussie doit avoir été confirmée par Freqtrade.
- L'API REST Freqtrade reste privée sur le réseau Docker.
- La documentation décrit le code présent, pas une architecture passée ou rêvée.

## État au 22 août 2026

- UI actuelle : présente, monolithique, construisible après installation des dépendances.
- Flux Binance public : présent avec repli simulé.
- Authentification console : présente, variables d'environnement obligatoires.
- Contrôle réel de Freqtrade : non connecté ; routes actuelles simulées.
- Stockage des réglages du simulateur : mémoire du processus uniquement.
- Validation stratégie : script réel de backtest, lookahead et analyse récursive ; aucun résultat fabriqué dans l'UI.
- Orchestrateur FastAPI : prototype testé séparément, non câblé à l'UI.

Priorité absolue : remplacer les routes simulées par un adaptateur Freqtrade typé, testé et observable avant toute utilisation en capital réel.
