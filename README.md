# Quant Core

Console de pilotage Freqtrade destinée à un déploiement Docker/Coolify. Le dépôt ne contient plus qu'une seule interface : une page Next.js sobre et responsive dans `console/`.

> État réel : la console lit l'état du moteur Freqtrade via son réseau Docker privé. Positions, soldes, profits, configuration, santé, ressources et logs ne possèdent aucun repli fictif. Les commandes restent volontairement verrouillées jusqu'à la phase d'activation auditée et réversible.

## Composants actifs

- `console/` : interface Next.js et routes API de la console.
- `docker-compose.coolify.yml` : console + moteur Freqtrade sur un réseau Docker privé.
- `templates/` : exemples de configuration Freqtrade et règles de risque.
- `orchestrator/` : prototype FastAPI conservé pour une future couche de contrôle ; il n'est pas connecté à la console actuelle.
- `clients/` : modèles historiques utiles à une future gestion multi-instance ; ils ne sont pas utilisés par le Compose actuel.
- `quant_rack/` : profils légers décrivant stratégie, indicateurs, protections, outils et budget VPS.

L'ancien portail Express situé dans `portal/placeholder`, son infrastructure AWS et sa documentation ont été supprimés le 22 août 2026. L'ancienne console à onglets et graphiques a également été remplacée par une cabine de supervision sans données simulées ni commande dangereuse.

## Démarrage local de la console

```bash
cp .env.example .env
# Remplacer tous les change-me dans .env
corepack enable
bun install --frozen-lockfile
bun run dev
```

Puis ouvrir `http://localhost:3000`.

## Déploiement Docker / Coolify

1. Créer `user_data/config.json` avec une configuration Freqtrade valide et une stratégie réellement présente dans `user_data/strategies/`.
2. Copier `.env.example` vers `.env`, puis remplacer tous les secrets.
3. Valider et démarrer :

```bash
docker compose --env-file .env -f docker-compose.coolify.yml config
docker compose --env-file .env -f docker-compose.coolify.yml up -d --build
```

Le port REST Freqtrade n'est pas publié sur l'hôte. Seule la console est publiée, sur `127.0.0.1:3000` par défaut. Pour Coolify, définir `CONSOLE_BIND_ADDRESS=0.0.0.0` si la plateforme doit joindre directement le conteneur via le port hôte.

## Variables obligatoires

- `FREQTRADE_USERNAME` / `FREQTRADE_PASSWORD` : compte REST du moteur Freqtrade.
- `FREQTRADE_ADMIN_USER` / `FREQTRADE_ADMIN_PASSWORD` : accès à la console.
- `FREQTRADE_JWT_SECRET` : secret aléatoire d'au moins 32 octets.
- `FREQTRADE_PIN_CODE` : optionnel ; vide désactive l'authentification par PIN.
- `EXCHANGE_API_KEY` / `EXCHANGE_API_SECRET` : optionnels en dry-run, à stocker uniquement comme secrets serveur/Coolify.
- `TELEGRAM_ENABLED`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` et `TELEGRAM_AUTHORIZED_USERS` : intégration Telegram native de Freqtrade. Un jeton publié doit être révoqué avant utilisation.
- `OBS_CPU_WARN_PCT`, `OBS_RAM_WARN_PCT` et `OBS_EXCHANGE_ERROR_WARN_COUNT` : seuils initiaux du collecteur léger ; ne les ajuster qu'après la fenêtre de sept jours.

La console est accessible depuis plusieurs ordinateurs via son domaine HTTPS avec le même compte opérateur. Les clés exchange et Telegram restent côté serveur : les variables `FREQTRADE__...` surchargent la configuration Freqtrade au démarrage et ne sont jamais renvoyées au navigateur.

Générer un secret robuste :

```bash
openssl rand -hex 32
```

## Qualité

```bash
bun run lint
bun run build
bun test console/lib
python -m pip install -r orchestrator/requirements-dev.txt
python -m pytest orchestrator/tests
python -m unittest discover -s tests
```

## Quant Rack

```bash
scripts/rackctl list
scripts/rackctl plan baseline
scripts/rackctl activate baseline
scripts/preflight --require-telegram --require-exchange
scripts/researchctl plan baseline --timerange 20260101-20260630
scripts/researchctl benchmark baseline --rows 10000 --repeats 5 --confirm BENCHMARK
docker compose --env-file .env -f docker-compose.coolify.yml run --rm rack-observer sample
```

Depuis le VPS, l'activation vérifiée passe par le réseau privé Docker :

```bash
docker compose --env-file .env -f docker-compose.coolify.yml run --rm rack-preflight --require-telegram --require-exchange
docker compose --env-file .env -f docker-compose.coolify.yml run --rm rack-operator deploy baseline --confirm DRY-RUN
```

La dernière commande initialise uniquement l'état du rack. Pour modifier la configuration, utiliser explicitement `--apply-config`, examiner la sauvegarde, puis redémarrer le moteur. Voir [`quant_rack/README.md`](quant_rack/README.md).

Le pilotage du chantier se trouve dans la [feuille de route et le tableau de suivi](ROADMAP.md). La mise en production suit obligatoirement le [runbook Coolify](docs/COOLIFY_CUTOVER_RUNBOOK.md).

Voir aussi [l'audit du code](docs/CODE_AUDIT_2026-08-22.md), [l'étude outils et stratégies](docs/STRATEGY_TOOLING_STUDY_2026-08-22.md), [la cartographie Freqtrade/Rack](docs/FREQTRADE_RACK_MAP_2026-08-22.md) et [l'architecture](ARCHITECTURE.md) avant de brancher un compte d'échange.
