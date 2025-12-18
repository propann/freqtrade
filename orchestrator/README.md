# Orchestrateur FastAPI (SaaS multi-tenant)

Orchestrateur REST qui gère plusieurs bots Freqtrade isolés sur une instance EC2 Docker. Il ne modifie jamais le cœur de Freqtrade et s'appuie sur des configurations générées par template + injection de secrets AWS au runtime.

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
- Aucun secret stocké : les fichiers générés contiennent des placeholders et attendent l'injection via AWS SSM/Secrets Manager.
- Réseaux dédiés : `fta-client-<tenant_id>` pour isoler les conteneurs Docker.
- Gating abonnement : un tenant inactif reçoit `402 Payment Required` sur les endpoints sensibles.

## Tests
```bash
pytest orchestrator/tests
```
