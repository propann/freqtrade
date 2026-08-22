# Audit du code — 22 août 2026

## Verdict

Le dépôt contenait deux produits superposés : un ancien portail Express/AWS de décembre 2025 et une nouvelle console Next.js ajoutée le 21 août 2026. L'ancien portail et toute sa chaîne de déploiement ont été retirés. La console actuelle est visuellement riche, mais reste majoritairement une démonstration : elle n'est pas encore un poste de trading réel.

## Nettoyage effectué

- suppression de `portal/placeholder/` et des deux README associés ;
- suppression de l'ancien Compose EC2, Nginx, scripts systemd/ops et docs AWS/PayPal qui déployaient ce portail ;
- suppression des rapports historiques sans extension et du guide de session obsolète ;
- retrait du workspace portal dans `package.json` et `bun.lock` ;
- ajout d'un Dockerfile pour la console actuelle ;
- réécriture des documents racine selon le code présent ;
- suppression du vocabulaire « portail » restant dans l'UI active.

## Problèmes bloquants trouvés

### 1. Authentification contournable — corrigé

La route acceptait plusieurs comptes, mots de passe et PIN codés en dur, dont `0000`. Le Compose et le script de déploiement publiaient aussi des secrets par défaut. Ces valeurs ont été supprimées et les secrets sont désormais obligatoires.

### 2. Endpoints sensibles non protégés — corrigé

Les routes de contrôle, identifiants, logs et backtest étaient appelables sans session. Les routes conservées vérifient maintenant le cookie ou le bearer token signé ; la route de faux backtest et la route d'identifiants ont été supprimées.

### 3. Interface présentée comme live alors que les données sont simulées — corrigé visuellement, intégration réelle à faire

`control.ts` et `logs.ts` fabriquent encore positions, performances et événements. `ticker.ts` et `klines.ts` utilisent Binance quand disponible, puis génèrent des données artificielles. Le bandeau global et les indicateurs de source signalent maintenant le mode démonstration ; la route et les résultats de faux backtest ont été supprimés.

Action requise : remplacer les routes simulées par le client Freqtrade réel et étendre `dataMode` à `delayed` et `unavailable`.

### 4. Aucun adaptateur Freqtrade réel — à construire

`FREQTRADE_API_URL`, le nom d'utilisateur et le mot de passe sont injectés dans le conteneur, mais les routes de contrôle ne les utilisent pas. Les boutons ne pilotent donc pas le moteur.

Action requise : implémenter un client REST serveur typé, avec timeout, gestion de token, validation de schéma, journalisation et tests d'intégration.

### 5. Collecte de secrets dangereuse — supprimée

La console collectait des clés exchange en mémoire et pouvait les écrire en clair dans le JSON Freqtrade, tout en simulant le test de connexion. La route et le formulaire ont été supprimés.

Action requise avant réintroduction : choisir une source de vérité chiffrée côté serveur, sans retour de secret complet dans les réponses API ou logs.

### 6. Monolithe frontend — dette élevée

`console/pages/index.tsx` a été réduit d'environ 4 400 à 2 100 lignes en retirant les anciens onglets, les classements inventés, le faux laboratoire de backtest et le formulaire de secrets. Il mélange encore navigation, données de démonstration et formulaires.

Action requise : extraire layout, navigation, cartes, tableaux, formulaires, hooks API et types par domaine. Commencer par l'authentification, le terminal, le risque et les réglages.

### 7. Déploiement incomplet — partiellement corrigé

Le Compose référençait un Dockerfile absent, exposait Freqtrade sur l'hôte et utilisait une stratégie/configuration non fournies. Le Dockerfile a été ajouté et le port moteur est maintenant interne. L'utilisateur doit encore fournir `user_data/config.json` et la stratégie correspondante.

## Ordre recommandé

1. Construire et tester `FreqtradeClient` en lecture seule : ping, état, balance, trades.
2. Brancher les mutations avec confirmations et dry-run forcé.
3. Extraire le monolithe UI en composants.
4. Ajouter tests API/auth, rate limiting, CSRF et stockage de secrets.
5. Décider si `orchestrator/` devient le backend officiel ou s'il doit être supprimé ; ne pas conserver deux plans de contrôle.
