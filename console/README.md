# Console web (Next.js)

Interface dark UI permettant de piloter l'orchestrateur FastAPI sans exposer de promesses de gains financiers.

## Démarrer en local
```bash
cd console
npm install
npm run dev
```

## Pages incluses
- **Overview** : état global, quotas et incidents.
- **Performance** : indicateurs techniques issus des bots (toujours en dry-run par défaut).
- **Risk** : limites appliquées côté orchestrateur.
- **Events** : audit trail et alertes.
- **Actions** : commandes start/pause/restart, rotation des secrets, restauration.

La console consomme les endpoints du service orchestrateur (port 9000 par défaut). Aucun secret n'est exposé dans le frontend.
