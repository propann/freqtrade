# Pricing (MVP)

Objectif : garder un modèle simple pendant la phase MVP payante, sans publier de coûts cloud précis. La facturation repose sur la consommation technique et une marge fixe.

## Méthode de calcul
1) **CPU/RAM** : nombre de vCPU réservés par job + limite mémoire appliquée via Docker (`cpus`, `mem_limit`).
2) **Durée des jobs** : temps d'exécution cumulé (par backtest ou stratégie) calculé à partir des logs de lancement/fin.
3) **Stockage** : volume persistant par client (`clients/<id>/data`) + répertoire des résultats (`results/<job_id>`).
4) **Marge** : pour couvrir support/maintenance et réserve de capacité (appliquée sur le total CPU/RAM/stockage).
5) **Sur-consommation** : au-delà des quotas d'un plan, facturation à l'usage (CPU-minute, Go-mois) pour les clients avancés.

## Exemples de plans (indicatifs)
Les montants sont donnés en **€/mois** pour faciliter la communication, sans détailler les coûts AWS internes. Les quotas sont appliqués via les variables d'environnement (`DEFAULT_CPU`, `DEFAULT_MEM_LIMIT`, `DEFAULT_PIDS_LIMIT`) et les limites Docker.

### Plan 20
- Ciblé pour la découverte : environ 1 vCPU, 1 Go RAM, `pids_limit=256`.
- Jobs en file unitaire (1 backtest actif à la fois), DRY-RUN privilégié sur la phase de test.
- Stockage resserré pour les résultats (purge après quelques jours si inactif).

### Plan 30
- Pensé pour les utilisateurs réguliers : 1-2 vCPU agrégés, 2 Go RAM.
- Quelques backtests en parallèle autorisés lorsque l'orchestrateur sera branché.
- Rétention de résultats plus longue et espace `results/` étendu.

### Plan +
- Pour les clients lourds : vCPU/RAM ajustables sur demande, `pids_limit` relevé selon besoin.
- Priorité plus élevée sur la file de jobs à la demande.
- Stockage et rétention adaptés (snapshot/archivage au-delà d'un seuil).

Les plafonds exacts (CPU/RAM/stockage) sont paramétrés côté Docker/Fargate et peuvent être ajustés avant ouverture générale.
