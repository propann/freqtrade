# Pricing model (MVP)

Objectif : facturer de façon prévisible tout en restant simple pour le MVP PayPal.

## Méthode de calcul
- **Compute** : comptabiliser le CPU et la RAM réservés par job (quanta horaires) et le temps d'exécution effectif.
- **Stockage** : mesurer l'espace occupé par `clients/<id>/data` (datasets, résultats) et appliquer un palier (inclus + dépassement).
- **Durée des jobs** : tracer chaque backtest/hyperopt/dry-run et agréger le temps total consommé par mois.
- **Marge** : ajouter une marge opérateur fixe pour couvrir le support et la maintenance (sans détailler les coûts cloud internes).
- **Seuils de sécurité** : inclure des limites par défaut (CPU=1.0, RAM=1024m, PIDs=256) pour éviter les abus et garder la facture maîtrisée.

## Plans exemples (indicatifs)
Ces plans sont purement illustratifs : ils n'incluent pas de prix ni de coûts AWS détaillés.

### BASIC
- 1 vCPU logique, 1 Go RAM par job.
- Quota mensuel de jobs courts (backtests DRY-RUN only pour la phase test) avec stockage modeste.
- Support email standard.

### PRO
- Jusqu'à 2 vCPU logiques et 2 Go RAM par job.
- Quotas de jobs plus longs + davantage de stockage pour les datasets/résultats.
- Priorité de support et possibilité d'élargir les quotas sur demande.

## Notes de gating
- Le portail refuse toute action provision/start/backtest si `subscriptions.status != active`.
- L'état d'abonnement est piloté par PayPal (abonnement mensuel) et stocké en base Postgres.
