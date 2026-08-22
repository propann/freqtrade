# Quant Rack

Quant Rack sélectionne un profil de stratégie et publie son budget, ses indicateurs, ses protections et ses outils. Il ne lance pas un service par indicateur : le moteur Freqtrade reste unique.

## États

- `on` : fonction active pendant le trading ;
- `job` : commande ponctuelle, jamais résidente ;
- `warm` : préparée mais inactive ;
- `off` : non chargée.

Les profils décrivent l'intention. Les stratégies Python restent responsables du calcul réel de leurs indicateurs. Une future extraction d'un registre partagé ne sera acceptée que si les mesures montrent un gain supérieur à la complexité ajoutée.

## Commandes

```bash
scripts/rackctl list
scripts/rackctl plan baseline
scripts/rackctl status
```

Avant toute première mise en route avec les secrets Coolify :

```bash
docker compose --env-file .env -f docker-compose.coolify.yml run --rm rack-preflight --require-telegram --require-exchange
```

`rack-preflight` est éphémère et monte le dépôt en lecture seule. Il ne contacte ni Telegram ni l'exchange et n'affiche jamais les valeurs contrôlées.

Sélectionner un profil sans toucher au moteur :

```bash
scripts/rackctl activate baseline
```

Sauvegarder `user_data/config.json`, imposer le dry-run et sélectionner la stratégie :

```bash
scripts/rackctl activate baseline --apply-config
docker compose --env-file .env -f docker-compose.coolify.yml restart freqtrade-engine
```

Le redémarrage n'est jamais automatique. L'opérateur peut donc examiner la sauvegarde et l'état résolu avant de toucher au bot déployé.

Activation transactionnelle réservée au dry-run :

```bash
docker compose --env-file .env -f docker-compose.coolify.yml run --rm rack-operator plan baseline
docker compose --env-file .env -f docker-compose.coolify.yml run --rm rack-operator deploy baseline --confirm DRY-RUN
```

Le conteneur `rack-operator` est créé à la demande puis supprimé. Il rejoint le réseau Docker privé sans publier de port. `deploy` refuse un moteur live ou avec des positions ouvertes. Il verrouille les activations concurrentes, sauvegarde puis écrit atomiquement la configuration, appelle `reload_config`, vérifie `health`, la stratégie, la timeframe et le dry-run. Si une étape échoue, il restaure la sauvegarde et demande au moteur de recharger l'ancienne configuration. Le journal `user_data/rack/audit.jsonl` contient uniquement l'acteur, les empreintes SHA-256, le profil et le résultat — jamais les identifiants API.

## Économie de ressources

- une seule stratégie live ;
- timeframe 15m ;
- cinq paires par profil au départ ;
- un seul job de recherche à la fois ;
- Hyperopt et FreqAI désactivés par défaut ;
- limites Docker configurables ;
- état du rack lu par la console depuis un montage en lecture seule.

## Atelier de recherche éphémère

Préparer les données Freqtrade, puis examiner le plan sans lancer de conteneur :

```bash
scripts/researchctl plan baseline --timerange 20260101-20260630
```

Lancer ensuite exactement un backtest borné :

```bash
scripts/researchctl run baseline --timerange 20260101-20260630 --confirm RESEARCH
```

Le service Compose `strategy-lab` ne démarre jamais avec le bot normal. `researchctl` le crée pour le travail demandé, refuse un second job concurrent, puis `docker compose run --rm` le supprime. Chaque expérience conserve le profil, la période, l'empreinte de la stratégie, la durée, le résultat et les logs sous `user_data/research/`.

Valider ensuite la stratégie dans le même atelier et sous le même verrou :

```bash
scripts/researchctl validate baseline --timerange 20260101-20260630 --confirm VALIDATE
```

Cette commande enchaîne découverte, backtest avec protections, détection du biais d'anticipation et analyse récursive. Le CSV lookahead est contrôlé automatiquement et bloque la suite si un biais est signalé. Le résultat récursif reste volontairement `review_required` : Freqtrade fournit des écarts par indicateur dont le seuil acceptable dépend des signaux. Lire `recursive.stdout.log` avant toute promotion, puis effectuer un test hors échantillon et un dry-run prolongé. `scripts/strategy-check.sh` n'est plus qu'un raccourci compatible vers cette commande centralisée ; son premier argument est désormais l'identifiant du profil.

## Mesure des indicateurs

Mesurer le passage `populate_indicators` avec une charge déterministe identique pour chaque stratégie :

```bash
scripts/researchctl benchmark baseline --rows 10000 --repeats 5 --confirm BENCHMARK
scripts/researchctl benchmark ichi-v1 --rows 10000 --repeats 5 --confirm BENCHMARK
```

Le benchmark s'exécute dans le même conteneur éphémère et avec les mêmes quotas que les backtests. Il relève la médiane, le p95, le temps par millier de bougies, la mémoire ajoutée au DataFrame, le pic RSS et les colonnes produites. Le jeu OHLCV est une charge déterministe de comparaison, clairement marquée comme telle : ce n'est ni une donnée de marché ni une mesure de performance financière. Les rapports JSON restent dans `user_data/research/` et servent de référence avant toute mutualisation ou mise en cache.

## Observabilité légère

Un relevé ne démarre aucun démon supplémentaire. Le conteneur rejoint brièvement le réseau privé, interroge cinq endpoints Freqtrade, écrit une ligne sans secret puis disparaît :

```bash
docker compose --env-file .env -f docker-compose.coolify.yml run --rm rack-observer sample
docker compose --env-file .env -f docker-compose.coolify.yml run --rm rack-observer summary --hours 168
```

Pour une tâche planifiée Coolify, exécuter `sample --fail-on-alert` toutes les cinq minutes. Un CPU ou une RAM à 80 %, un moteur arrêté, une API indisponible, une fraîcheur dépassant deux timeframes ou trois erreurs exchange dans les 100 derniers événements produit un état d'alerte. Le texte des événements exchange n'est jamais recopié dans l'historique. Les relevés restent dans `user_data/observability/samples.jsonl` ; un résumé filtré est écrit atomiquement dans `summary-168h.json` et affiché en lecture seule dans la console.
