# Console web (Next.js)

Interface Next.js minimale de Quant Core. Une page unique et responsive montre uniquement l'essentiel : moteur, capital, positions, stratégie, rack, ressources, alertes et derniers journaux. Son adaptateur serveur interroge Freqtrade sur le réseau Docker privé avec authentification, timeout, cache court et états dégradés. Aucun secret Freqtrade ou exchange n'est envoyé au navigateur. Les mutations sont bloquées pendant la phase lecture seule.

## Démarrer en local
```bash
cd console
npm install
npm run dev
```

## Informations affichées

- état moteur et avertissement distinct pour dry-run, réel, dégradé ou indisponible ;
- capital, positions ouvertes, P&L total et quotidien ;
- positions remontées par Freqtrade, sans donnée simulée ;
- profil Quant Rack, stratégie, timeframe, budget et indicateurs chargés ;
- CPU, RAM, version, exchange, fraîcheur et journaux réels ;
- synthèse glissante des relevés VPS sur sept jours, incidents et erreurs exchange comptées sans conserver leur texte ;
- checklist de mise en service, sans formulaire de secret ni commande de trading.

L'ancienne interface à onglets, ses graphiques et ses panneaux décoratifs ont été retirés. Les commandes ne seront ajoutées qu'avec confirmation forte, journal d'audit, contrôle santé et rollback. Voir `../ROADMAP.md`.
