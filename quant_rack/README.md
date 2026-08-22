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
export FREQTRADE_API_URL=http://127.0.0.1:8080
export FREQTRADE_USERNAME='...'
export FREQTRADE_PASSWORD='...'
export QUANT_RACK_ACTOR='azoth'
scripts/rackctl plan baseline
scripts/rackctl deploy baseline --confirm DRY-RUN
```

`deploy` refuse un moteur live ou avec des positions ouvertes. Il verrouille les activations concurrentes, sauvegarde puis écrit atomiquement la configuration, appelle `reload_config`, vérifie `health`, la stratégie, la timeframe et le dry-run. Si une étape échoue, il restaure la sauvegarde et demande au moteur de recharger l'ancienne configuration. Le journal `user_data/rack/audit.jsonl` contient uniquement l'acteur, les empreintes SHA-256, le profil et le résultat — jamais les identifiants API.

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
