# Console web (Next.js)

Interface dark Next.js de Quant Core. Elle ne pilote pas encore l'orchestrateur FastAPI ni le moteur Freqtrade réel : les routes de contrôle et de logs sont simulées. La vue Validation affiche uniquement le protocole CLI réel et aucun rendement fabriqué.

## Démarrer en local
```bash
cd console
npm install
npm run dev
```

## Vues incluses
- **Terminal Démo & Positions** : état, positions et logs explicitement simulés.
- **Marché & Graphique** : données Binance publiques avec repli signalé comme simulé.
- **Risque** : protections réellement définies dans la baseline.
- **Validation** : commandes de backtest, lookahead et analyse récursive.
- **Stratégies** : baseline installée et pistes de recherche.
- **Connexions, Réglages, Déploiement** : état d'intégration et configuration sûre.

La console doit évoluer vers un adaptateur serveur Freqtrade unique. Aucun secret ne doit être exposé dans le frontend. Voir `../docs/CODE_AUDIT_2026-08-22.md`.
