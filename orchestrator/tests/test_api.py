from fastapi.testclient import TestClient

from orchestrator.app.main import app

client = TestClient(app)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_tenant_creation():
    payload = {"tenant_id": "tenant-a", "email": "tenant-a@example.com", "subscription_status": "active"}
    resp = client.post("/tenants", json=payload)
    assert resp.status_code == 200
    assert resp.json()["tenant_id"] == payload["tenant_id"]


def test_bot_lifecycle():
    tenant_id = "demo"
    create_payload = {
        "strategy": "SampleStrategy",
        "template": "default",
        "risk": {
            "max_concurrent_pairs": 3,
            "max_drawdown_percent": 20,
            "max_daily_trades": 30,
            "stake_amount": 10,
        },
    }
    created = client.post(f"/tenants/{tenant_id}/bots", json=create_payload)
    assert created.status_code == 200
    bot_id = created.json()["bot_id"]

    started = client.post(f"/bots/{bot_id}/start")
    assert started.status_code == 200
    assert started.json()["status"] == "running"

    paused = client.post(f"/bots/{bot_id}/pause")
    assert paused.status_code == 200
    assert paused.json()["status"] == "paused"

    restarted = client.post(f"/bots/{bot_id}/restart")
    assert restarted.status_code == 200
    assert restarted.json()["status"] == "running"

    status = client.get(f"/bots/{bot_id}/status")
    assert status.status_code == 200
    assert status.json()["bot_id"] == bot_id

    audit = client.get(f"/tenants/{tenant_id}/audit")
    assert audit.status_code == 200
    assert any(entry["action"] == "create" for entry in audit.json()["entries"])
