# Orchestrateur FastAPI expérimental

Prototype REST historique pour gérer plusieurs bots Freqtrade isolés. Il n'est pas connecté à la console Next.js ni lancé par le Compose actuel. Il est conservé jusqu'à la décision d'architecture : en faire le backend officiel ou le supprimer.

## Lancer en local (dev)
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn orchestrator.app.main:app --reload --port 9000
```

## Endpoints clés
- `POST /tenants` : crée ou met à jour un tenant.
- `GET /tenants/{tenant_id}/bots` : liste des bots du tenant.
- `POST /tenants/{tenant_id}/bots` : crée un bot (subscription active requise).
- `POST /bots/{bot_id}/start|pause|restart` : transitions du cycle de vie.
- `GET /bots/{bot_id}/status` : état courant.
- `GET /bots/{bot_id}/logs` : lecture contrôlée des logs (pas de secrets).
- `GET /tenants/{tenant_id}/audit` : audit trail.

## Sécurité et isolation
- Aucun secret stocké : les fichiers générés contiennent des placeholders et attendent l'injection par le mécanisme de secrets du déploiement.
- Réseaux dédiés : `fta-client-<tenant_id>` pour isoler les conteneurs Docker.
- Gating abonnement : un tenant inactif reçoit `402 Payment Required` sur les endpoints sensibles.

## Tests
```bash
pytest orchestrator/tests
```
