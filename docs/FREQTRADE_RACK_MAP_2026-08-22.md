# Cartographie Freqtrade pour Quant Rack — 22 août 2026

Révision étudiée : dépôt officiel Freqtrade, commit `e7622ba` du 21 août 2026.

## Décision

Ne pas forker ni « nettoyer » le cœur Freqtrade. Il contient déjà les bons points d'extension et son code de sécurité/exchange évolue vite. Quant Rack doit piloter ces points d'extension, garder l'image officielle `stable` et laisser les modules coûteux éteints.

Un fork amaigri économiserait peu de CPU au repos, mais créerait une dette dangereuse sur les exchanges, ordres, migrations de base et correctifs de sécurité.

## Anatomie utile

| Bloc Freqtrade | Rôle | Décision Rack |
|---|---|---|
| `Worker` | boucle, états et rechargement | conserver intact |
| `FreqtradeBot` | orchestration trading | conserver intact |
| `Configuration` | fusion JSON, environnement et CLI | point d'entrée principal du rack |
| `ExchangeResolver` | charge l'exchange | garder Binance spot uniquement au départ |
| `StrategyResolver` | charge une stratégie par son nom | emplacement naturel des profils Rack |
| `DataProvider` | OHLCV et données analysées | source unique, ne pas dupliquer dans la console |
| `PairListManager` | génère et filtre les paires | `StaticPairList` + filtres peu coûteux |
| `ProtectionManager` | charge les protections déclarées | piloté par chaque stratégie |
| `RPCManager` | Telegram, Discord, webhook, REST | chargement déjà conditionnel ; Telegram + REST seulement |
| `Persistence` / `Wallets` | trades, ordres et soldes | toujours actifs |
| `optimize/*` | backtest et Hyperopt | jobs ponctuels hors moteur live |
| `freqai/*` | ML, RL et modèles | désactivé sur le petit VPS |
| `plot/*` / Jupyter | graphiques et exploration | hors image live |

## Ce qui est déjà « rackable » sans modifier Freqtrade

Freqtrade utilise des resolvers pour les stratégies, exchanges, pairlists et protections. Son `RPCManager` importe Telegram, Discord, webhook et API uniquement lorsqu'ils sont activés. Les dépendances lourdes de Hyperopt, FreqAI, RL, Plot et Jupyter sont déclarées comme extras Python distincts.

Le rack doit donc produire une configuration résolue et demander un `reload_config`. Freqtrade sait alors arrêter proprement l'instance, relire la configuration et reconstruire la stratégie et ses modules.

## Profil live minimal

Toujours actifs :

- Worker et moteur de trading ;
- configuration et validation ;
- exchange Binance spot ;
- base SQLite ;
- wallets et ordres ;
- DataProvider ;
- stratégie sélectionnée ;
- protections ;
- API REST privée ;
- Telegram si configuré.

Désactivés :

- FreqAI et reinforcement learning ;
- Hyperopt résident ;
- Plot/Jupyter dans le conteneur live ;
- Discord, webhook et consumer externe ;
- futures, levier et position adjustment ;
- pairlists dynamiques nécessitant tous les tickers ;
- orderflow et carnets L2 permanents.

## Vrais leviers CPU/RAM

1. `process_only_new_candles = True`.
2. Timeframe 15m plutôt que 1m.
3. Cinq paires statiques avant élargissement mesuré.
4. Aucun timeframe informatif sans justification.
5. Un seul bot et une seule stratégie live.
6. Un seul job de validation à la fois.
7. Image officielle `stable`, sans extras FreqAI/Plot.
8. Indicateurs limités aux colonnes utilisées par les signaux ou le risque.

Supprimer des fichiers Python inutilisés de l'image ne réduit presque pas la charge : ils ne consomment rien tant qu'ils ne sont pas importés. Le gain vient de ce qui s'exécute à chaque boucle et pour chaque paire.

## Phases suivantes

### B1 — observation réelle

- remplacer l'état simulé de la console par `ping`, `show_config`, `sysinfo`, `status`, `balance` et `trades` ;
- mesurer durée de boucle, CPU, RAM, nombre de paires et fraîcheur des bougies ;
- enregistrer ces mesures dans l'état du rack.

### B2 — activation contrôlée

- traduire un profil Rack vers un fichier de surcharge Freqtrade ;
- vérifier stratégie, configuration et état des positions ;
- appeler `reload_config` via le réseau Docker privé ;
- revenir automatiquement à la sauvegarde si la santé ne revient pas.

### B3 — registre d'indicateurs, seulement si les mesures le justifient

- extraire les indicateurs communs dans une bibliothèque de stratégie locale ;
- calculer chaque série une fois par dataframe ;
- conserver les stratégies comme assemblages lisibles ;
- ne jamais déplacer le calcul OHLCV dans la console.

### B4 — atelier séparé

- conteneur éphémère pour backtest/lookahead/récursif ;
- Hyperopt optionnel avec quota strict ;
- arrêt complet du job dès la production du rapport.

## Contrat de mise à jour

- pinner une version mensuelle Freqtrade testée au lieu de suivre aveuglément une image mouvante ;
- tester les deux stratégies et la configuration avant mise à jour ;
- conserver le schéma JSON officiel ;
- ne jamais modifier `freqtrade/freqtradebot.py`, `exchange/`, `persistence/` ou les migrations dans notre dépôt ;
- préférer API, configuration, stratégie et plugins publics aux imports internes.

Références officielles : [configuration](https://www.freqtrade.io/en/stable/configuration/), [REST API](https://www.freqtrade.io/en/stable/rest-api/), [plugins](https://www.freqtrade.io/en/stable/plugins/), [personnalisation des stratégies](https://www.freqtrade.io/en/stable/strategy-customization/), [dépôt Freqtrade](https://github.com/freqtrade/freqtrade).
