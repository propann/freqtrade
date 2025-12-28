# HOWTO: create first session azoth

## Prérequis
- Portail démarré (`infra/scripts/deploy.sh`).
- Variables `ADMIN_EMAIL` et `ADMIN_PASSWORD_HASH` configurées dans `.env`.
- Mot de passe admin en clair disponible pour l'authentification API.

## Étapes
1. Récupérer un token admin :
   ```bash
   export PORTAL_HOST_URL=http://localhost:8088
   export ADMIN_EMAIL=admin@example.com
   export ADMIN_PASSWORD=your-admin-password

   TOKEN=$(curl -sS -X POST "$PORTAL_HOST_URL/api/v1/auth/login" \
     -H 'Content-Type: application/json' \
     -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | \
     python -c "import json,sys; print(json.load(sys.stdin)['token'])")
   ```

2. Créer la session `azoth` :
   ```bash
   curl -sS -X POST "$PORTAL_HOST_URL/api/v1/sessions" \
     -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"name":"azoth"}'
   ```

3. Démarrer la session :
   ```bash
   curl -sS -X POST "$PORTAL_HOST_URL/api/v1/sessions/<session_id>/start" \
     -H "Authorization: Bearer $TOKEN"
   ```

4. Vérifier le statut et les logs :
   ```bash
   curl -sS "$PORTAL_HOST_URL/api/v1/sessions/<session_id>/status" \
     -H "Authorization: Bearer $TOKEN"

   curl -sS "$PORTAL_HOST_URL/api/v1/sessions/<session_id>/logs?tail=20" \
     -H "Authorization: Bearer $TOKEN"
   ```

5. Arrêter la session :
   ```bash
   curl -sS -X POST "$PORTAL_HOST_URL/api/v1/sessions/<session_id>/stop" \
     -H "Authorization: Bearer $TOKEN"
   ```
