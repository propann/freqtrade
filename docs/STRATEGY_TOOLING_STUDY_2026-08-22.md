# Étude outils et stratégies — 22 août 2026

## Décision produit

Quant Core ne doit pas devenir une collection de boutons ni un musée de stratégies trouvées sur GitHub. La cible saine est : un moteur Freqtrade stable, trois stratégies maximum en comparaison, une chaîne de validation reproductible, un risque visible et une console qui dit toujours d'où vient chaque donnée.

## Outils à intégrer

| Priorité | Outil | Utilité | Décision |
|---|---|---|---|
| P0 | API REST Freqtrade | État, balance, trades, performances, listes, santé et commandes réelles | Construire un adaptateur serveur unique ; ne jamais exposer l'API moteur à Internet |
| P0 | WebSocket RPC | Événements de fills, whitelist et indicateurs sans polling agressif | Ajouter après le client REST en lecture seule |
| P0 | Backtesting exporté | Résultats reproductibles incluant frais | Intégrer les résultats natifs, supprimer le générateur statique actuel |
| P0 | `lookahead-analysis` | Détecte l'utilisation accidentelle de données futures | Bloquant avant promotion d'une stratégie |
| P0 | `recursive-analysis` | Vérifie la stabilité des indicateurs selon le nombre de bougies initiales | Bloquant avant dry-run prolongé |
| P0 | Protections | Cooldown, séries de stoploss, drawdown et paires peu rentables | Incluses dans `QuantCoreBaseline`, à régler par backtest |
| P1 | `backtesting-analysis` | Analyse par tags d'entrée/sortie et raisons d'échec | Ajouter au rapport de validation |
| P1 | Hyperopt ciblé | Ajuste un petit nombre de paramètres | Seulement après un baseline honnête ; optimisation hors-échantillon obligatoire |
| P1 | Pairlists filtrées | Écarte listings trop jeunes, spreads et prix imprécis | Statique au début pour la reproductibilité, dynamique plus tard |
| P2 | FreqAI | Recherche adaptative et réentraînement | Laboratoire séparé, pas le moteur par défaut |

Références officielles : [REST API](https://www.freqtrade.io/en/stable/rest-api/), [backtesting](https://www.freqtrade.io/en/stable/backtesting/), [lookahead analysis](https://www.freqtrade.io/en/stable/lookahead-analysis/), [recursive analysis](https://www.freqtrade.io/en/stable/recursive-analysis/), [plugins et protections](https://www.freqtrade.io/en/stable/plugins/), [hyperopt](https://www.freqtrade.io/en/stable/hyperopt/).

## Stratégies à tester

### 1. QuantCoreBaseline — ajoutée

Tendance/pullback en spot, timeframe 15 minutes : EMA 50/200 pour le régime, ADX pour éviter les marchés sans direction, RSI pour le retour du momentum et filtre de volume. Elle est volontairement courte et lisible. Son rôle n'est pas de gagner par magie, mais de servir d'étalon contrôlable.

### 2. IchiV1Research — modernisation de la stratégie fournie

Le fichier fourni `ichiV1.py` utilisait encore l'interface V2 (`buy`/`sell`), modifiait les colonnes OHLC avec Heikin-Ashi, recalculait à chaque boucle, nommait des périodes EMA comme de faux timeframes et acceptait un stoploss de 20 %. Ces choix augmentaient le risque de résultats trompeurs et la charge CPU en 1m.

`strategies/IchiV1Research.py` conserve l'idée Ichimoku + tendance, mais passe à l'interface V3, garde OHLCV intact, utilise 15m, ajoute volume et protections, et réduit le stoploss initial à 8 %. Elle reste non validée jusqu'aux analyses lookahead, récursive et hors échantillon.

Ajouter « tous les indicateurs » a été écarté : la documentation officielle recommande de ne calculer que ceux qui alimentent une décision, sinon mémoire et CPU sont gaspillés.

### 3. QuantCoreMeanReversion — candidate suivante

Retour à la moyenne avec bandes de Bollinger et RSI, autorisé uniquement lorsque la pente de l'EMA longue et l'ADX indiquent un régime latéral. Sans filtre de régime, cette famille attrape les couteaux qui tombent avec un enthousiasme admirable mais coûteux.

### 4. QuantCoreBreakout — candidate suivante

Cassure de canal avec ATR et expansion de volume, plus stop adapté à la volatilité. Elle complète le baseline dans les marchés impulsifs. Le nombre de paramètres doit rester faible.

Ces familles couvrent tendance, Ichimoku, range et expansion. On les compare ; on ne les active pas simultanément avant d'avoir mesuré leurs corrélations et leurs conflits.

## Ce qu'il ne faut pas ajouter maintenant

- Les méga-stratégies à centaines de conditions et les forks non maintenus : impossibles à expliquer, faciles à sur-optimiser.
- Les winrates copiés d'un README : sans période, exchange, paires, frais, slippage et capital, ce ne sont pas des métriques, seulement du maquillage.
- Futures, levier et short : ils multiplient les modes d'échec avant que le spot soit fiable.
- FreqAI dans le chemin principal : l'exemple officiel n'est pas destiné à la production ; les modèles ajoutent coût CPU/RAM, risque de fuite de données et complexité de réentraînement. CatBoost n'est notamment pas disponible sur les petits appareils ARM. FreqAI ne fonctionne pas avec une pairlist de volume qui ajoute et retire dynamiquement des paires. Voir la [documentation FreqAI](https://www.freqtrade.io/en/stable/freqai/).
- Carnet L2, DEX multiples, flotte de quatre bots et Telegram simulé dans l'UI : Telegram est confié à l'intégration native Freqtrade ; les autres écrans ne reviendront qu'avec une source réelle et testée.

Le dépôt officiel de stratégies précise lui-même que ses exemples sont éducatifs, fournis sans garantie et doivent servir de point de départ, pas de solution prête à trader : [freqtrade-strategies](https://github.com/freqtrade/freqtrade-strategies).

## Protocole de sélection

Une stratégie n'est promue vers le dry-run prolongé que si elle passe toutes les étapes :

1. Données propres sur plusieurs régimes : tendance haussière, baissière, range et choc.
2. Backtest avec frais, protections, capital et nombre de positions identiques au déploiement.
3. `lookahead-analysis` sans biais détecté.
4. `recursive-analysis` stable avec un `startup_candle_count` réaliste.
5. Découpage entraînement / validation / hors-échantillon ; aucun hyperopt sur la période finale.
6. Test de sensibilité : frais et slippage plus sévères, paramètres légèrement déplacés.
7. Minimum de trades suffisant pour éviter le triomphe statistique de trois coups de chance.
8. Dry-run de plusieurs semaines avec comparaison backtest/live-candles.

Les métriques principales sont : drawdown maximal sur equity, profit factor, expectancy, stabilité mensuelle, durée des pertes, exposition, nombre de trades et différence entre backtest et dry-run. Le winrate seul est secondaire.

## Simplification de la console

La navigation cible tient en six zones :

1. **Tableau de bord** : santé moteur, mode réel/simulé, solde, positions et alertes.
2. **Marché** : graphique et source des données.
3. **Stratégies** : stratégies réellement installées, version Git et statut de validation.
4. **Validation** : téléchargement des données, backtest, lookahead, récursif et rapports.
5. **Risque** : protections, limites et bouton d'arrêt.
6. **Réglages** : connexion moteur, exchange, secrets et déploiement.

À retirer du chemin principal tant que non fonctionnel : flotte multi-bots, carnet L2, copilote IA, screener séparé, Telegram, étude DEX, hyperopt ML marketing et page « ancien système ». Leur code devra ensuite être supprimé, pas seulement caché, lors du découpage de `index.tsx`.

## Plan d'implémentation

### Phase A — fondations

- Brancher `/ping`, `/health`, `/show_config`, `/status`, `/count`, `/balance`, `/performance` et `/logs` via un client serveur.
- Afficher `live`, `delayed`, `simulated` ou `unavailable` pour chaque source.
- Remplacer les chiffres statiques par des états vides explicites.

### Phase B — laboratoire

- Lancer le pipeline `scripts/strategy-check.sh` en tâche contrôlée.
- Lire les exports natifs de Freqtrade et conserver les paramètres, versions, périodes et hashes de stratégie.
- Comparer les trois familles sans inventer de score global opaque.

### Phase C — commandes

- Autoriser start/pause seulement en dry-run au début.
- Ajouter confirmations renforcées et journal d'audit pour force-entry/force-exit.
- N'activer le live qu'après une checklist signée et réversible.

### Phase D — FreqAI optionnel

- Profil Docker séparé sur machine adaptée.
- Expérience mesurée contre le meilleur baseline non-ML.
- Suppression si le gain hors-échantillon ne compense pas la complexité.
