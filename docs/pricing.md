# Pricing (MVP)

Objectif : garder un modèle simple pendant la phase MVP payante, sans publier de coûts cloud précis. La facturation repose sur la consommation technique et une marge fixe.

## Méthode de calcul
1) **CPU/RAM** : nombre de vCPU réservés par job + limite mémoire appliquée via Docker (`cpus`, `mem_limit`).
2) **Durée des jobs** : temps d'exécution cumulé (par backtest ou stratégie) calculé à partir des logs de lancement/fin.
3) **Stockage** : volume persistant par client (`clients/<id>/data`) + répertoire des résultats (`results/<job_id>`).
4) **Marge** : pour couvrir support/maintenance et réserve de capacité (appliquée sur le total CPU/RAM/stockage).

## Exemples de plans (indicatifs)
### BASIC
- 1 vCPU, 1 Go RAM, `pids_limit=256`.
- Jobs DRY-RUN uniquement pendant la phase de test.
- Stockage persistant limité (quelques Go) pour les résultats.

### PRO
- 2 vCPU, 2-3 Go RAM, `pids_limit` ajusté si besoin.
- Files d'attente de jobs plus larges (plusieurs backtests parallèles quand l'orchestrateur sera branché).
- Stockage de résultats plus généreux et rétention plus longue.

Les plafonds exacts (CPU/RAM/stockage) sont paramétrés côté Docker/Fargate et peuvent être ajustés avant ouverture générale.
