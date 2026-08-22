# Console web (Next.js)

Interface Next.js personnelle de Quant Core. La porte d'entrée compacte ne révèle ni la nature ni les composants du service ; après connexion, une page responsive montre capital, positions, stratégie, rack, outils, ressources, alertes et derniers journaux. Le compte unique remplace les anciens rôles et le raccourci PIN. Son adaptateur serveur interroge le cœur sur le réseau Docker privé avec authentification, timeout, cache court et états dégradés. Le panneau Réglages écrit Exchange et Telegram dans un fichier privé sans jamais relire les valeurs dans le navigateur. Les commandes démarrer, pause et recharger exigent le mot de passe ; aucun ordre forcé n'est exposé.

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
- état des outils du rack, sans formulaire de secret ni commande de trading.

L'ancienne interface à onglets, ses graphiques et ses panneaux décoratifs ont été retirés. La session est signée, liée au propriétaire configuré et protégée contre les rafales de tentatives. Les journaux sont bornés et nettoyés côté serveur avant affichage. Les trois commandes opérationnelles disposent d'une confirmation forte ; les futures commandes de trading exigeront en plus un journal d'audit métier et des protections dédiées. Voir `../ROADMAP.md`.
