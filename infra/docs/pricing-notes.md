# Notes de pricing (MVP)

Objectif : facturer un abonnement mensuel (PayPal) avec des quotas techniques par plan. Les coûts AWS ne sont pas détaillés ici; on décrit uniquement la méthode de calcul.

## Méthode de calcul
1. Définir des quotas par plan (BASIC/PRO) : CPU, mémoire, nombre de jobs mensuels, rétention des résultats.
2. Estimer la consommation moyenne d'un job (durée * CPU * RAM) et appliquer un coefficient de marge.
3. Additionner les coûts de stockage (volume data + sauvegardes) et de réseau (interne seulement dans le MVP).
4. Ajouter une marge fixe pour couvrir le support et les incidents.

## Exemple de paliers (indicatif, sans coût AWS)
- BASIC : quotas par défaut (`cpu=1.0`, `mem=1024m`, `pids=256`), nombre de jobs mensuels limité (ex: 30 backtests), rétention courte.
- PRO : quotas supérieurs (ex: `cpu=2.0`, `mem=2048m`), plus de jobs mensuels, rétention plus longue.

## Facturation
- Abonnement mensuel via PayPal.
- L'état `subscriptions.status` (active/past_due/canceled) décide si le portail autorise un job.
- En cas de dépassement de quotas, suspendre le provisionnement ou exiger un upgrade.
