# Audit complet du code — 22 août 2026

## Verdict

Le dépôt forme désormais un seul produit mono-propriétaire : une cabine Next.js, un cœur officiel isolé et un rack d'outils ponctuels. Le portail historique, l'infrastructure AWS, puis les derniers restes SaaS (tenants, abonnements, PayPal, quotas, modèles multi-clients et orchestrateur FastAPI) ont été supprimés.

Aucun défaut critique connu ne reste dans le chemin de supervision. Les nouvelles mutations sont limitées aux réglages privés et aux commandes démarrer, pause et recharger, avec origine, session, mot de passe et confirmation. Une dette critique de dépendance subsiste toutefois : Next.js `14.2.3` est inférieur à `14.2.25`, version corrigée pour l'avis Middleware CVSS 9.1. L'application n'utilise actuellement aucun middleware Next.js ni App Router, ce qui réduit les chemins concernés, mais ne transforme pas une version ancienne en version saine. Next.js annonce en plus une publication critique le 26 août 2026 pour ses branches maintenues. L'exposition publique et le trading réel restent donc bloqués jusqu'à cette migration, la rotation des secrets, la validation Coolify, les résultats hors échantillon et sept jours d'observation.

## Périmètre et méthode

- base historique : `79d30d1`, dernière révision avant le nettoyage du 22 août ;
- chemin actif : `console/`, `docker-compose.coolify.yml`, `quant_rack/`, `scripts/` et `strategies/` ;
- contrôles : recherches de secrets et de données fictives, revue des frontières réseau, appels périodiques, écritures disque, sous-processus, sauvegarde/rollback et scénarios d'échec ;
- validation automatique : tests Bun, lint/build Next.js, compilation Python, tests unitaires, profils Rack, YAML Compose et `git diff --check`.

## Résultats par zone

| Zone | Verdict | Éléments contrôlés |
|---|---|---|
| Produit | Conforme | Un propriétaire, une interface, aucun flux SaaS ou multi-tenant |
| Authentification | Renforcée | Compte obligatoire, comparaison constante, token HMAC lié au propriétaire, durée fixe de 7 jours, cookie protégé |
| Anti-bruteforce | Renforcée | Verrou local après 8 échecs sur 15 minutes, réponse `429` et `Retry-After` |
| Routes API | Conforme en lecture | Session exigée, méthodes refusées, erreurs typées, aucun endpoint de mutation exposé |
| Données | Conforme | État réel uniquement, aucun ticker, bougie, position ou résultat simulé |
| Journaux | Renforcée | 100 événements maximum, 2 000 caractères par ligne, formes usuelles et valeurs configurées masquées |
| Réseau | Conforme | Cœur accessible uniquement sur le réseau Docker privé, seule la console peut être publiée |
| Santé HTTP | Renforcée | Réponse neutre, prérequis d'accès vérifiés, absence de cache et `HEALTHCHECK` natif |
| En-têtes HTTP | Renforcée | CSP, anti-framing, `nosniff`, référent nul et capteurs désactivés |
| Secrets | Renforcée | Saisie authentifiée, stockage privé `0600`, valeurs jamais renvoyées, configuration séparée et rollback |
| Rack | Conforme en dry-run | Profils bornés, état public filtré, sauvegarde atomique, verrou, contrôle des positions, santé et rollback |
| Recherche | Conforme comme atelier | Un job, conteneur jetable, CPU/RAM/PID bornés, timeout, registre et garde OOS |
| Stratégies | À valider | Code lisible et indicateurs justifiés, mais aucun résultat réel n'est présumé avant rapports et dry-run |
| Documentation | Alignée | Architecture, sécurité, contexte, README, roadmap et performance décrivent le code présent |

## Corrections réalisées pendant l'audit

1. Suppression de `orchestrator/`, `clients/`, des modèles multi-instances et des validateurs de quotas.
2. Retrait du job CI FastAPI et recentrage sur les outils actifs et la console.
3. Renommage des paquets en `quant-core` et `quant-core-console`.
4. Extraction et tests du format de session signé ; rejet des tokens modifiés, expirés ou liés à un autre propriétaire.
5. Ajout d'un verrou temporaire contre les rafales de connexion.
6. Filtrage et limitation des journaux avant leur arrivée dans le navigateur.
7. Suppression de quatre lectures internes inutilisées par l'interface et espacement des rafraîchissements.
8. Mise à jour des métadonnées et documents qui parlaient encore de démonstration, simulation ou SaaS.
9. Ajout d'une sonde de santé neutre, d'un contrôle Docker et d'en-têtes HTTP défensifs ; requête de connexion bornée à 4 Kio et non mise en cache.
10. Correction de la sonde pour refuser les placeholders, ajout d'un coffre serveur, d'une configuration privée Freqtrade séparée et d'un rechargement avec rollback.

## Risques restants

### Élevés — portes opérationnelles

- Next.js doit migrer vers la branche maintenue intégrant le correctif annoncé le 26 août 2026 ; régénérer le lockfile et refaire la CI, sans mise à jour partielle improvisée ;
- l'image `freqtradeorg/freqtrade:stable` flotte ; pinner une version testée avant le capital réel ;
- tout jeton Telegram déjà publié doit être révoqué et remplacé dans Coolify ;
- les deux stratégies sont des candidates de recherche, pas des promesses de rendement ;
- la restauration de `user_data` et de SQLite doit être réellement testée sur le VPS.

### Moyens — dette maîtrisée

- le limiteur de connexion est local au processus ; il est adapté à une instance, pas à un cluster ;
- les réponses du cœur sont normalisées défensivement mais sans validateur de schéma externe ;
- l'interface principale a grossi avec le coffre ; extraire ses panneaux en composants après validation fonctionnelle sur le VPS, sans ajouter de dépendance UI ;
- Basic Auth circule en HTTP sur le réseau Docker privé ; ne jamais publier le port interne.

### Faibles

- les conteneurs ponctuels Python utilisent l'utilisateur par défaut de leur image ; leurs montages et profils limitent déjà leur portée, mais un UID dédié serait un durcissement supplémentaire ;
- la conservation et la rotation des rapports de recherche restent à définir après mesure du disque réel.

## Décision de passage

Le code peut continuer en déploiement personnel et en dry-run. Le passage réel reste bloqué tant que le préflight, la rotation des secrets, le rollback, la fenêtre OOS et l'observation de sept jours ne sont pas validés sur la machine cible.

Références officielles : [avis Middleware GHSA-f82v-jwr5-mffw](https://github.com/vercel/next.js/security/advisories/GHSA-f82v-jwr5-mffw), [publication de sécurité Next.js annoncée pour le 26 août 2026](https://nextjs.org/blog).
