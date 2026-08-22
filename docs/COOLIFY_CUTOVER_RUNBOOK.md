# Runbook de mise en production Coolify

Ce runbook s'applique à toute fusion ou redéploiement susceptible de remplacer le conteneur Freqtrade. Il interdit le déploiement automatique non surveillé sur un bot réel.

## Informations à consigner

| Champ | Valeur |
|---|---|
| Date et opérateur | À compléter |
| Commit déployé | À compléter |
| Profil rack | À compléter |
| Mode avant/après | `dry_run` / `live` |
| Positions ouvertes avant | À compléter |
| Sauvegarde | Chemin et heure à compléter |
| Résultat | Succès / rollback |

## 1. Porte avant fusion

- [ ] Les deux jobs de la PR sont verts.
- [ ] Le diff ne contient ni jeton, ni clé exchange, ni fichier `.env`.
- [ ] Le jeton Telegram précédemment exposé a été révoqué ; le nouveau existe uniquement dans les secrets Coolify.
- [ ] Les clés exchange n'autorisent pas les retraits.
- [ ] Le mode actuel du bot est connu.
- [ ] Les positions ouvertes sont listées. En live, aucune fusion sans décision explicite sur leur reprise.
- [ ] L'auto-déploiement Coolify est suspendu si la fenêtre n'est pas immédiatement surveillée.

## 2. Sauvegarde

Sauvegarder au minimum le volume `user_data`, la base de trades et la configuration active via le mécanisme de sauvegarde du VPS/Coolify. Vérifier que l'archive est non vide et noter son emplacement. Ne jamais copier les secrets dans Git ni dans un ticket.

## 3. Prévalidation du profil

Après avoir posé les secrets dans Coolify, exécuter la porte de sécurité sans afficher leurs valeurs :

```bash
docker compose --env-file .env -f docker-compose.coolify.yml run --rm rack-preflight --require-telegram --require-exchange
```

Le résultat doit être `status: pass`. Corriger chaque échec avant de construire ou redémarrer un conteneur. Le contrôle refuse notamment les valeurs `change-me`, les secrets faibles ou intégrés à `config.json`, le mode réel, les entrées forcées, les CORS ouverts et toute valeur secrète retrouvée dans un fichier suivi par Git.

Dans un shell du service ou sur une copie exacte du volume :

```bash
scripts/rackctl list
scripts/rackctl plan baseline
python -m unittest discover -s tests
```

Pour préparer la configuration, commencer en dry-run :

```bash
scripts/rackctl activate baseline --apply-config
```

Vérifier la sauvegarde annoncée par la commande et le diff de la configuration sans afficher ses valeurs secrètes.

Quand l'API interne est joignable depuis le shell, préférer l'activation transactionnelle :

```bash
docker compose --env-file .env -f docker-compose.coolify.yml run --rm rack-operator deploy baseline --confirm DRY-RUN
```

La commande refuse le live et les positions ouvertes, recharge via l'API native, vérifie la santé puis rollback automatiquement en cas d'échec. Examiner la dernière ligne de `user_data/rack/audit.jsonl` avant de poursuivre.

## 4. Déploiement contrôlé

1. Fusionner le commit validé pendant la fenêtre surveillée.
2. Suivre le build Coolify jusqu'à l'état sain.
3. Vérifier que seul le service attendu a été remplacé.
4. Contrôler le démarrage Freqtrade, la stratégie, la timeframe, la pairlist et `dry_run=true`.
5. Contrôler la console, l'état du rack et la réception d'une notification Telegram de test ne contenant aucun secret.

## 5. Contrôles après déploiement

- [ ] `ping` répond et le moteur reste sain.
- [ ] La stratégie et le profil affichés correspondent.
- [ ] Le nombre de paires et de trades maximum respecte le profil.
- [ ] Aucune boucle de redémarrage ni erreur d'authentification exchange.
- [ ] CPU et RAM restent sous 80 % de leur limite pendant 15 minutes.
- [ ] Les bougies sont fraîches et aucun signal n'est pris sur des données périmées.
- [ ] En dry-run, un cycle complet est observé avant clôture de la fenêtre.

## 6. Déclencheurs de rollback

Restaurer immédiatement la version précédente si le moteur ne devient pas sain, si la stratégie/configuration n'est pas celle prévue, si la base n'est pas lisible, si les ressources saturent durablement ou si un secret apparaît dans les logs.

Rollback : redéployer l'image/commit précédent, restaurer `user_data` uniquement si une migration ou une écriture invalide l'exige, puis vérifier l'état et les positions. Conserver les logs de l'échec sans y recopier de secret.

## 7. Passage ultérieur en live

Le passage en live est une opération distincte. Il exige la totalité des portes P7 de [`ROADMAP.md`](../ROADMAP.md), une nouvelle sauvegarde, une confirmation manuelle et un démarrage avec exposition minimale. Ne jamais transformer automatiquement un déploiement de code en activation de fonds réels.

## 8. Recherche hors moteur live

Ne jamais lancer backtest ou hyperopt dans le conteneur `freqtrade-engine`. Utiliser `scripts/researchctl` : le profil Compose `strategy-lab` est éphémère, limité à un job et supprimé après le travail. Vérifier l'espace disque disponible avant l'export et archiver uniquement les expériences utiles.

Avant de promouvoir une stratégie, fixer une date de séparation non utilisée pendant son réglage puis exécuter `scripts/researchctl oos` avec un ratio de frais prudent. Un verdict `passed` ne dispense ni de lire les rapports natifs Freqtrade ni d'effectuer un dry-run prolongé : le backtest ne reproduit pas un véritable slippage intrabougie.

## 9. Observation sur sept jours

Créer dans Coolify une tâche planifiée toutes les cinq minutes avec la commande suivante :

```bash
docker compose --env-file .env -f docker-compose.coolify.yml run --rm rack-observer sample --fail-on-alert
```

Après sept jours, produire le résumé et reporter les maxima CPU/RAM, les états dégradés et la fraîcheur dans la feuille de route :

```bash
docker compose --env-file .env -f docker-compose.coolify.yml run --rm rack-observer summary --hours 168
```

Le même résumé est alors visible dans le panneau **Système → Observation 7 jours** de la console. Vérifier que le nombre de relevés approche 2 016, qu'aucun texte de log n'apparaît dans `samples.jsonl` et que les incidents affichés correspondent aux échecs de tâches Coolify.
