# Analyse concurrentielle — principes à reprendre

Cette comparaison sert à fixer les priorités du produit Quant Core. Elle ne
constitue ni un conseil d'investissement ni une validation de performance.

## Ce que font bien les concurrents

| Produit | Différenciation utile | Décision Quant Core |
| --- | --- | --- |
| Freqtrade | Backtests, analyses de biais d'anticipation et de récursivité, protections et API opérationnelle | Conserver le moteur, imposer les contrôles lookahead/recursive/OOS avant toute promotion. |
| Hummingbot | Cycle cohérent configuration → backtest → déploiement et orientation multi-connecteurs, dont DEX | Reprendre la séparation claire recherche/exécution ; ne pas intégrer un DEX tant que la mesure de latence et de slippage n'est pas prouvée. |
| Jesse | Rapports de backtest et lecture visuelle des transactions | Afficher dans la console un catalogue factuel : statut, étoiles, période, nombre de trades, drawdown et limites. |
| NautilusTrader | Même modèle d'événements pour simulation et exécution réelle | S'inspirer de la discipline d'exécution (frais, latence, remplissages) sans remplacer le moteur Freqtrade, disproportionné pour ce VPS. |

## Écarts à fermer, dans l'ordre

1. **Catalogue vérifiable.** Chaque stratégie garde sa provenance, son empreinte, sa compatibilité, les logs et les métriques d'un test reproductible.
2. **Promotion graduelle.** `importée` → `chargeable` → `backtestée` → `sans biais détecté` → `hors échantillon` → `dry-run` ; aucune étoile élevée sans ces étapes.
3. **Réalisme d'exécution.** Frais prudents, latence p50/p95/p99 et slippage observé à partir des ordres réellement remplis ; jamais inventé à partir d'un seul backtest.
4. **Console en lecture seule pour la recherche.** Elle explique ce qui est utilisable, sans autoriser l'exécution de code de stratégie ni l'import de dépôts externes.
5. **DEX et futures séparés.** Ils exigent des profils, données, protections et critères de remplissage distincts du spot Binance.

## Extension sans alourdir l'interface

Le noyau expose uniquement le profil actif, son mode (`spot`, `perp`, `dex`),
son exchange/réseau et ses garde-fous. Les écrans spécifiques, connecteurs et
secrets ne sont chargés que lorsqu'un profil correspondant est configuré. Un
profil dérivé ne peut jamais réutiliser par défaut les limites, le slippage ou
les protections d'un profil spot.

## Ce que nous ne copions pas

- Une promesse de rendement ou un classement fondé sur le seul profit d'une année.
- L'exécution simultanée de nombreuses stratégies sur un capital restreint.
- Des dépôts externes exécutés directement : ils restent en quarantaine, montés en lecture seule pendant l'audit.

## Sources primaires

- Freqtrade : [stratégies](https://docs.freqtrade.io/en/latest/strategy-customization/), [lookahead analysis](https://docs.freqtrade.io/en/stable/lookahead-analysis/) et [recursive analysis](https://docs.freqtrade.io/en/stable/recursive-analysis/).
- Hummingbot : [documentation](https://hummingbot.org/docs/) et [Dashboard/backtesting](https://hummingbot.org/dashboard/backtest/).
- Jesse : [backtest](https://docs.jesse.trade/docs/backtest/) et [charts](https://docs.jesse.trade/docs/charts/).
- NautilusTrader : [documentation et architecture](https://nautilustrader.io/docs/latest/).
