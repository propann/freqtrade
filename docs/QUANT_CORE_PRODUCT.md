# Quant Core — produit et adaptateurs

Quant Core est le produit. Freqtrade est son premier adaptateur d'exécution
spot : il fournit aujourd'hui la boucle, les ordres, la persistance et l'API.
Il ne définit pas l'identité du produit.

## Noyau indépendant

| Noyau Quant Core | Adaptateurs de venue |
| --- | --- |
| catalogue, provenance et statut des stratégies | Freqtrade spot — actif |
| qualité OHLCV, backtest, anti-biais, OOS, benchmark ressources | CEX spot/perp — futur |
| limites de risque, frais, slippage et profil de latence | DEX / perps on-chain — futur |
| registre d'expériences et console lecture seule | données historiques / temps réel — futur |

Les stratégies et rapports sont évalués par le noyau. Un résultat obtenu sur
Binance spot ne valide jamais automatiquement une exécution sur un autre CEX,
un perp ou un DEX.

## Contrat minimal d'un adaptateur

Avant toute capacité de trading, un adaptateur doit exposer, en lecture seule :

- ses capacités (`spot`, `perp`, `dex`) et les paires/chaînes supportées ;
- son état de santé et l'âge des données ;
- le modèle de frais, précision, minimums et limites ;
- les ordres et fills normalisés, sans secret dans les rapports ;
- les métriques de latence et l'écart prix demandé / prix rempli.

Le registre de risque garde l'autorité : limites de capital, exposition,
drawdown, fréquence d'ordres et arrêt d'urgence. Aucun adaptateur ne reçoit de
commande directe du navigateur et aucun secret ne traverse l'UI.

## Séquence de construction

1. Freqtrade spot reste l'adaptateur de référence en dry-run.
2. Le noyau publie catalogue, qualité des données, coûts ressources et qualité
   d'exécution de façon uniforme.
3. Un adaptateur CEX ou DEX commence obligatoirement par données + santé +
   lecture de fills, sans ordre.
4. Il passe ensuite par simulation et dry-run avec un profil de risque séparé.
5. Le trading réel reste une décision opérateur explicite, réversible et jamais
   une conséquence d'un backtest.

Cette approche évite un fork total prématuré, mais empêche aussi Freqtrade de
devenir une limite produit.
