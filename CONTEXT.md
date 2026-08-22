# Contexte projet

## Direction

Quant Core doit devenir une console Freqtrade simple à déployer sur Coolify, un VPS ou un Raspberry Pi 5. Une seule interface est maintenue : la console Next.js `console/`.

## Règles de travail

- Le dry-run reste le mode par défaut jusqu'à validation complète du chemin réel.
- Aucun secret ou identifiant de secours dans Git.
- Une donnée simulée doit être explicitement identifiée comme simulée.
- Une action affichée comme réussie doit avoir été confirmée par Freqtrade.
- L'API REST Freqtrade reste privée sur le réseau Docker.
- La documentation décrit le code présent, pas une architecture passée ou rêvée.

## État au 22 août 2026

- UI actuelle : porte neutre et cabine responsive mono-propriétaire.
- Flux de marché décoratif : supprimé ; aucune donnée simulée dans la console.
- Authentification console : session signée liée au propriétaire, variables obligatoires et limitation des échecs.
- Contrôle réel : lectures en cache court, coffre privé et commandes démarrer, bloquer les entrées, recharger avec confirmation forte.
- Journaux : lecture réelle, lignes bornées et secrets filtrés avant retour au navigateur.
- Validation stratégie : script réel de backtest, lookahead et analyse récursive ; aucun résultat fabriqué dans l'UI.
- Ancienne couche SaaS : supprimée avec ses tenants, abonnements, paiements, quotas et modèles multi-clients.

Priorité absolue : valider le chemin complet sur le VPS en dry-run, observer sept jours, puis examiner les rapports de stratégie avant toute utilisation en capital réel.
