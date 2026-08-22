# Console web (Next.js)

Interface Next.js de Quant Core. Son adaptateur serveur interroge le moteur Freqtrade sur le réseau Docker privé avec authentification, timeout, cache court et états dégradés. Aucun secret Freqtrade ou exchange n'est envoyé au navigateur. Les mutations sont bloquées pendant la phase lecture seule.

## Démarrer en local
```bash
cd console
npm install
npm run dev
```

## Vues incluses
- **Terminal & Positions** : état, positions, soldes, profits et logs Freqtrade réels.
- **Marché & Graphique** : données Binance publiques ou état indisponible, sans bougie synthétique.
- **Risque** : protections réellement définies dans la baseline.
- **Validation** : commandes de backtest, lookahead et analyse récursive.
- **Stratégies** : baseline installée et pistes de recherche.
- **Connexions, Réglages, Déploiement** : état d'intégration et configuration sûre.

Les commandes ne seront ajoutées qu'avec confirmation forte, journal d'audit, contrôle santé et rollback. Voir `../ROADMAP.md`.
