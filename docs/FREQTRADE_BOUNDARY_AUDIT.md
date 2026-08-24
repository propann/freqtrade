# Audit de frontière Freqtrade / Quant Core

Date : 2026-08-24. Objectif : éliminer les doublons fonctionnels et conserver
Freqtrade comme moteur plutôt que le réimplémenter.

| Fonction | Source d'autorité | Couche Quant Core | Décision |
| --- | --- | --- | --- |
| Boucle de trading, ordres, portefeuille, protections | Freqtrade | profils et garde de risque | Ne pas dupliquer. |
| Backtest et archive reproductible | Freqtrade | audit groupé + registre qui lit les ZIP natifs | Conserver le moteur natif. |
| Lookahead et récursivité | Freqtrade | `researchctl` orchestre les commandes et conserve les verdicts | Ne jamais réimplémenter les analyses. |
| Données OHLCV | Freqtrade / exchange | `data_quality.py` vérifie trous, doublons et OHLC avant recherche | Complément nécessaire. |
| Benchmark CPU/RAM des indicateurs | absent du moteur | `indicator_bench.py` | Complément nécessaire, hors processus live. |
| API, logs et événements | API REST/WebSocket Freqtrade | console serveur, filtrage et résumés | Consommer l'API ; ne pas lancer FreqUI. |
| Santé VPS | Freqtrade fournit une partie des mesures | `observectl.py` agrège, borne et alerte | Complément nécessaire. |
| Latence CEX/DEX | absent du moteur | `latencyctl.py`, lecture seule | Complément nécessaire. |
| Frais/slippage réel | ordres/fills Freqtrade | futur collecteur basé sur API/WebSocket Freqtrade | À ajouter sans modifier le cœur. |
| Console | FreqUI existe mais ne correspond pas au modèle privé Quant Core | Next.js authentifiée, lecture minimale | Garder seulement la console Quant Core. |

## Doublons identifiés et décision

- `scripts/strategy-check.sh` ne contient aucune logique : il reste uniquement
  un raccourci compatible vers `researchctl validate`.
- `researchctl.py` ne recalcule pas les backtests ou les analyses : il appelle
  les commandes natives Freqtrade sous un verrou et enregistre les preuves.
- Aucun service FreqUI séparé n'est démarré dans Compose ; la console consomme
  l'API privée du moteur.

## Règle avant nouveau code

Avant d'ajouter un outil, vérifier la documentation Freqtrade et répondre à :

1. Est-ce une capacité native consommable par API/CLI/WebSocket ? Si oui,
   intégrer cette capacité au lieu de la reproduire.
2. Le besoin porte-t-il sur la qualité, la sécurité, la provenance ou une venue
   externe ? Si oui, Quant Core peut l'ajouter comme couche complémentaire.
3. Le code s'exécute-t-il dans la boucle de trading ? Si non, il doit rester un
   job éphémère et borné ; si oui, il doit avoir un benchmark et un budget.

La prochaine extension utile est le collecteur de qualité d'exécution : il doit
se brancher sur les messages de fills de l'API/WebSocket Freqtrade, conserver
uniquement les champs nécessaires et comparer prix demandé, prix rempli, frais
et latence. Il ne requiert pas un fork du cœur.
