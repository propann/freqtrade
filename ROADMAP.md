# Feuille de route Quant Core

Mise à jour : 22 août 2026. Ce document est le tableau de suivi de référence. Une tâche n'est terminée que lorsque son critère de sortie est vérifié et lié à un commit ou une PR.

## Objectif

Faire tourner un Freqtrade complet, sûr et observable sur un petit VPS, sans maintenir un fork allégé du cœur Freqtrade. Le « rack » active uniquement les stratégies, indicateurs et outils nécessaires au profil courant. La recherche lourde reste éphémère et hors du processus de trading.

Principes non négociables : secrets uniquement côté serveur, dry-run par défaut, aucune donnée simulée présentée comme réelle, une seule interface, limites CPU/RAM explicites, sauvegarde et retour arrière avant toute activation.

## Tableau de bord

| Phase | État | Résultat attendu | Porte de sortie |
|---|---|---|---|
| P0 — Nettoyage et sécurité | Terminé | Ancien portail/AWS retiré, secrets sortis du code, docs alignées | Audit et scan de secrets validés |
| P1 — Socle Quant Rack | Terminé | Profils, budgets VPS, activation locale sûre, affichage console | CI verte sur la PR #33 |
| P2 — Vérité terrain | En validation | Console minimale alimentée par l'API REST Freqtrade en lecture seule | Validation visuelle et réseau sur le VPS |
| P3 — Activation contrôlée | En validation | Changement de profil, rechargement, contrôle santé, rollback | Validation sur le moteur Coolify en dry-run |
| P4 — Bibliothèque indicateurs | À faire | Indicateurs partagés, calculés une seule fois si cela apporte un gain mesuré | Benchmark avant/après et API stable |
| P5 — Atelier stratégie | En validation | Backtest ponctuel, benchmark et validation sous un verrou unique | Exécution réelle sur le VPS et rapports examinés |
| P6 — Observabilité VPS | En validation | Relevés éphémères CPU, RAM, santé, positions et fraîcheur | Tâche Coolify active et budget tenu 7 jours |
| P7 — Passage réel | Bloqué | Déploiement progressif et réversible | Accord opérateur + dry-run concluant + aucune position non gérée |

États autorisés : `À faire`, `En cours`, `En validation`, `Bloqué`, `Terminé`.

## Lot actif — produit personnel et audit final

| ID | État | Action | Critère d'acceptation |
|---|---|---|---|
| RACK-01 | Terminé | Définir les profils `baseline` et `ichi-v1` | Profils validés par `rackctl` |
| RACK-02 | Terminé | Encadrer CPU, RAM, paires et jobs | Limites présentes dans profils et Compose |
| RACK-03 | Terminé | Sauvegarder la configuration avant écriture | Test automatique de sauvegarde réussi |
| RACK-04 | Terminé | Forcer le dry-run lors d'une application | Test automatique réussi |
| RACK-05 | Terminé | Exposer l'état du rack en lecture seule | Route authentifiée, volume monté en lecture seule |
| RACK-06 | Terminé | Réparer les jobs Python et console | Deux jobs GitHub Actions verts sur l'exécution 107 |
| RACK-07 | À faire | Exécuter la procédure de pré-déploiement | Checklist du runbook signée par l'opérateur |
| RACK-08 | Terminé | Automatiser le contrôle des secrets et du mode avant démarrage | Préflight sans valeur secrète, dépôt monté en lecture seule, mode réel refusé |

| ID | État | Action | Critère d'acceptation |
|---|---|---|---|
| CLEAN-01 | Terminé | Retirer la couche SaaS résiduelle | Aucun tenant, paiement, abonnement, quota ou orchestrateur dans le dépôt |
| CLEAN-02 | Terminé | Retirer les modèles multi-clients et leurs validations CI | Une seule cible de déploiement et une CI centrée sur le produit actif |
| SEC-01 | Terminé | Durcir l'accès personnel | Session liée au propriétaire, rafales bloquées et tests unitaires |
| SEC-02 | Terminé | Filtrer les journaux avant affichage | Secrets usuels et configurés masqués, lignes bornées et tests unitaires |
| PERF-01 | Terminé | Réduire le trafic périodique de la cabine | 8 requêtes navigateur/minute et 30 lectures internes/minute au régime nominal |
| DOC-01 | Terminé | Réaligner audit, architecture, contexte et performances | Aucun document actif ne décrit le prototype SaaS comme un composant présent |
| DEP-01 | Bloqué | Migrer Next.js vers la branche maintenue | Correctif annoncé le 26 août 2026 publié, lockfile régénéré, audit dépendances et CI verts |
| OPS-01 | Terminé | Ajouter une santé conteneur neutre et des en-têtes défensifs | Route générique, Docker `HEALTHCHECK`, test de prérequis et build vert |

## P2 — Client Freqtrade en lecture seule

| ID | Priorité | Action | Critère d'acceptation |
|---|---|---|---|
| API-01 | P0 — En validation | Client serveur avec timeout, authentification et erreurs typées | Tests unitaires succès, 401, timeout et réponse invalide |
| API-02 | P0 — En validation | Brancher `ping`, `show_config` et `sysinfo` | État moteur et ressources réels dans la console |
| API-03 | P0 — En validation | Brancher `status`, `balance` et historique des trades | Aucun fallback silencieux vers des données fictives |
| API-04 | P0 — En validation | Marquer clairement indisponibilité et ancienneté | Dernier état connu après un échec, indisponible au deuxième |
| API-05 | P1 — En validation | Supprimer les routes et jeux de données simulés restants | Recherche `demo/mock/fake` vide dans `console/` |
| UI-01 | P0 — Terminé | Remplacer l'ancienne interface à onglets par une page opérateur minimale | Moteur, capital, positions, rack, système et logs visibles sans graphique décoratif |
| UI-02 | P0 — Terminé | Conserver une interface sûre sur ordinateur et mobile | Aucun secret ni bouton de trading côté navigateur ; mise en page responsive |
| UI-03 | P0 — Terminé | Recentrer l'interface sur un propriétaire unique | Porte d'entrée neutre, compte unique sans PIN ni rôles, rack et outils visibles après connexion |

## P3 — Activation et retour arrière

| ID | Priorité | Action | Critère d'acceptation |
|---|---|---|---|
| ACT-01 | P0 — En validation | Prévalidation stratégie/configuration avant mutation | Une configuration invalide ne touche jamais le fichier actif |
| ACT-02 | P0 — En validation | Appliquer un profil avec journal d'audit sans secret | Acteur, profil, hash, heure et résultat enregistrés |
| ACT-03 | P0 — En validation | Recharger via l'API native `reload_config` | Santé confirmée après rechargement, sans redémarrage aveugle |
| ACT-04 | P0 — En validation | Restaurer automatiquement la dernière configuration saine | Tests succès, refus live et rollback injecté réussis |
| ACT-05 | P1 | Ajouter confirmation forte dans la console | Impossible d'activer en un clic accidentel |

## P4 — Rack d'indicateurs mesuré

On ne crée pas un nouveau moteur d'indicateurs. Les stratégies continuent d'utiliser les interfaces Freqtrade et les bibliothèques compatibles. Une mutualisation n'est acceptée que si le profilage démontre un coût évité.

| ID | Priorité | Action | Critère d'acceptation |
|---|---|---|---|
| IND-01 | P0 — En validation | Mesurer temps et mémoire du passage indicateurs par stratégie et volume de bougies | Benchmark éphémère reproductible codé ; rapports baseline/ichi-v1 à exécuter sur le VPS cible |
| IND-02 | P1 | Extraire les calculs communs EMA/RSI/ADX/ATR/volume | Parité des signaux sur un jeu OHLCV figé |
| IND-03 | P1 | Ajouter Ichimoku et Heikin-Ashi au registre optionnel | Chargés uniquement par `ichi-v1` |
| IND-04 | P2 | Mettre en cache par paire/timeframe/bougie si utile | Gain mesuré supérieur à 15 %, mémoire sous budget |
| IND-05 | P0 — En cours | Refuser les doublons et dépendances lourdes non justifiées | Doublons de profil refusés ; revue de dépendance encore à automatiser |

## P5 — Atelier de recherche éphémère

| ID | Priorité | Action | Critère d'acceptation |
|---|---|---|---|
| LAB-01 | P0 — Terminé | File locale limitée à un job | Verrou commun aux backtests, benchmarks et validations ; test concurrent réussi |
| LAB-02 | P0 — Terminé | Conteneur backtest jetable avec limites | Service Compose à profil, CPU/RAM/PID bornés et `run --rm` |
| LAB-03 | P1 | Hyperopt opt-in uniquement | Paquet et processus absents du moteur live |
| LAB-04 | P1 — Terminé | Registre des expériences | Profil, commit, hashes stratégie/config, période, durée, verdicts, sorties et logs enregistrés |
| LAB-05 | P0 — En validation | Garde anti-surapprentissage | Split OOS, frais explicites, seuils bloquants et archives codés ; slippage réel à éprouver en dry-run |

## P6 — Observabilité et budgets

Le collecteur ponctuel `rack-observer` est codé et testé. Il compte les erreurs exchange sans stocker le texte des logs, maintient un résumé glissant de 168 heures et l'expose dans la console par une route authentifiée qui filtre explicitement chaque champ. Il reste à planifier son exécution toutes les cinq minutes dans Coolify, vérifier la remontée des échecs et conserver sept jours complets avant d'ajuster les seuils.

| ID | État | Action | Critère d'acceptation |
|---|---|---|---|
| OBS-01 | Terminé | Relever CPU, RAM, santé, fraîcheur, positions et redémarrages | Échantillon JSONL sans secret et tests d'indisponibilité |
| OBS-02 | Terminé | Compter les erreurs exchange récentes | Aucun texte de log conservé ; seuil initial de trois erreurs |
| OBS-03 | Terminé | Publier le résumé 168 h dans la console | Route authentifiée, liste blanche de champs et état vide explicite |
| OBS-04 | En validation | Exécuter la collecte toutes les cinq minutes | Tâche Coolify active et échec visible sur alerte |
| OBS-05 | À faire | Observer une semaine complète | Seuils revus seulement après 2 016 relevés attendus |

| Signal | Seuil initial | Réaction |
|---|---:|---|
| RAM moteur | 1 024 Mio | Alerte à 80 %, diagnostic avant hausse |
| CPU moteur | 1 vCPU | Alerte si saturation durable 5 min |
| Paires actives | 5 | Refus d'activation au-delà du profil |
| Jobs de recherche | 1 | Mise en file obligatoire |
| Fraîcheur des bougies | 2 intervalles | État dégradé et blocage des nouvelles entrées |
| Erreurs exchange dans les 100 derniers logs | 3 | Échec de la tâche Coolify sans conserver le texte ; notification à raccorder |

Les seuils seront ajustés après sept jours de mesures, jamais au ressenti.

## P7 — Portes de passage en réel

Toutes les conditions suivantes sont obligatoires :

- CI verte et image déployable identifiée par commit ;
- jeton Telegram précédemment exposé révoqué et remplacé dans Coolify ;
- clés exchange limitées au trading, sans retrait, et idéalement filtrées par IP ;
- sauvegarde `user_data` et configuration testée en restauration ;
- dry-run continu concluant, alertes et arrêt d'urgence testés ;
- aucune position réelle ouverte ou procédure explicite de reprise ;
- validation manuelle du propriétaire avant fusion/déploiement de `main`.

## Risques suivis

| Risque | Niveau | Réduction | État |
|---|---|---|---|
| Auto-déploiement Coolify lors d'une fusion | Critique | Fusion uniquement pendant une fenêtre contrôlée | Ouvert |
| Secret Telegram divulgué dans une conversation | Critique | Révocation et rotation avant déploiement | Bloquant opérateur |
| Next.js 14.2.3 hors branche maintenue | Critique | Migration après le correctif annoncé du 26 août 2026 ; accès amont obligatoire jusque-là | Bloquant exposition publique/live |
| Console connectée mais non validée sur le VPS | Élevé | P2 doit être observée en dry-run sur Coolify | En validation |
| Positions réelles durant un redémarrage | Critique | Vérifier mode et positions avant action | Ouvert |
| Surcharge petit VPS par la recherche | Élevé | Recherche éphémère, une tâche, quotas | Couvert par conception |
| Fork du cœur Freqtrade difficile à maintenir | Élevé | Conserver le cœur officiel et ses extensions natives | Décision actée |

## Journal de décisions

| Date | Décision | Motif |
|---|---|---|
| 2026-08-22 | Une seule interface Next.js | Éliminer les portails concurrents et la dette UI |
| 2026-08-22 | Secrets via variables Coolify | Aucune clé durable dans Git ou le navigateur |
| 2026-08-22 | Ne pas amincir le cœur Freqtrade | Les résolveurs et modules optionnels fournissent déjà les frontières utiles |
| 2026-08-22 | Profils déclaratifs et activation explicite | Réduire la charge sans comportement implicite |
| 2026-08-22 | PR avant `main` pour le rack | Le déploiement existant peut redémarrer automatiquement |
| 2026-08-22 | Cabine opérateur sans fioriture | Réduire la charge cognitive, le JavaScript et les dépendances de visualisation |
| 2026-08-22 | Un seul propriétaire, un seul compte | Supprimer les rôles et accès alternatifs sans retirer la sécurité de session |
| 2026-08-22 | Supprimer la couche SaaS résiduelle | Éviter deux produits, deux plans de contrôle et une CI sans rapport avec l'usage réel |
| 2026-08-22 | Rafraîchir selon le rythme utile | Une stratégie 15 min n'a pas besoin d'une pluie d'appels toutes les cinq secondes |

## Rythme de suivi

- À chaque PR : mettre à jour les IDs touchés, les critères et les risques.
- À chaque déploiement : compléter le journal du runbook avec commit, sauvegarde et résultat.
- Chaque semaine en phase de test : relever CPU/RAM, erreurs, fraîcheur et nombre de redémarrages.
- Aucune phase suivante ne masque une porte de sortie non satisfaite ; elle reste explicitement bloquée.

Prochaine séquence : déployer le commit audité, poser les secrets renouvelés dans Coolify, confirmer le dry-run et l'absence de positions non gérées, puis observer P2/P3/P5 sur le VPS avant tout passage réel.
