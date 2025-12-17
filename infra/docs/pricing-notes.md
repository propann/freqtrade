# Notes de pricing (MVP)

Objectif : facturer un abonnement mensuel (PayPal) avec des quotas par plan et un pricing basé sur la consommation CPU/RAM/temps de job.

## Méthode de calcul
1. Définir le coût interne cible (crédits AWS/EC2 + stockage) puis ajouter une marge.
2. Fixer des quotas par plan (exemple : BASIC = quotas par défaut ; PRO = +50%).
3. Facturer les dépassements éventuels au temps de job (minutes CPU) et au stockage (Go/mois) si activé ultérieurement.
4. Re-évaluer mensuellement selon l'usage réel et les coûts cloud.

## Exemples de paliers (indicatifs, sans coûts AWS réels)
- BASIC : 20€/mois, quotas par défaut (`cpu=1.0`, `mem=1024m`, `pids=256`), nombre de jobs simultanés limité (par exemple 1).
- PRO : 30€/mois, quotas +50% (`cpu=1.5`, `mem=1536m`, `pids=384`), plus de jobs simultanés.
- ENTERPRISE : sur devis, quotas personnalisés et support prioritaire.

## Bonnes pratiques
- Toujours vérifier le statut d'abonnement (`active`) avant tout provisionnement ou lancement de job.
- Limiter et journaliser chaque job (durée, ressources consommées) pour préparer la facturation basée sur la consommation.
- Prévoir un garde-fou de quotas par plan dans le portail et dans les scripts d'orchestration.
