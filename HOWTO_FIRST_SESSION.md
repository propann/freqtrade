# HOWTO — Première session

Ce guide décrit la toute première session pour vérifier que l’infra et l’API sont opérationnelles.

## Pré-requis
- Portail démarré et accessible via `PORTAL_HOST_URL`.
- Compte admin disponible (`ADMIN_EMAIL`, `ADMIN_PASSWORD`).
- (Optionnel) Orchestrator accessible via `ORCHESTRATOR_URL`.

## Étapes rapides
1. **Connexion**
   - Ouvrir `PORTAL_HOST_URL` et se connecter avec les identifiants admin.
2. **Créer une session**
   - Aller dans l’onglet **Sessions**.
   - Saisir un nom de session et cliquer sur **Create**.
3. **Démarrer / arrêter**
   - Utiliser **Start** puis **Stop** pour valider le cycle de vie.
4. **Vérifier les logs**
   - Ouvrir la session créée et consulter la section **Logs (tail)**.
5. **Consulter l’historique**
   - Dans la même page, la section **Audit trail** expose l’historique des actions et les métadonnées associées.

## Smoke-test automatisé
Le script `infra/scripts/smoke-test-infra-api.sh` vérifie la santé du portail, l’API et le chemin complet de création de session.

```bash
PORTAL_HOST_URL="http://localhost:8080" \
ADMIN_EMAIL="admin@example.com" \
ADMIN_PASSWORD="change-me" \
ORCHESTRATOR_URL="http://localhost:9000" \
infra/scripts/smoke-test-infra-api.sh
```
