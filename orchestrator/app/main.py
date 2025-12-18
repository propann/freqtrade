from __future__ import annotations

import os
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import ActionResponse, AuditResponse, BotInstance, CreateBotRequest, LogResponse, Tenant
from .services.bot_manager import BotManager

app = FastAPI(title="Freqtrade SaaS Orchestrator", version="0.1.0")


BASE_DIR = Path(os.environ.get("ORCHESTRATOR_ROOT", Path(__file__).resolve().parent.parent))
manager = BotManager(base_dir=BASE_DIR)
manager.seed_demo()


def require_tenant(tenant_id: str) -> Tenant:
    tenants = {t.tenant_id: t for t in manager.state.list_tenants()}
    tenant = tenants.get(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


def get_manager() -> BotManager:
    return manager


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/tenants", response_model=Tenant)
def create_tenant(tenant: Tenant, mgr: BotManager = Depends(get_manager)) -> Tenant:
    return mgr.create_tenant(tenant.tenant_id, tenant.email)


@app.get("/tenants/{tenant_id}/bots", response_model=list[BotInstance])
def list_bots(tenant_id: str, mgr: BotManager = Depends(get_manager), _: Tenant = Depends(require_tenant)) -> list[BotInstance]:
    return mgr.state.list_bots(tenant_id)


@app.post("/tenants/{tenant_id}/bots", response_model=ActionResponse)
def create_bot(
    tenant_id: str,
    payload: CreateBotRequest,
    mgr: BotManager = Depends(get_manager),
    tenant: Tenant = Depends(require_tenant),
) -> ActionResponse:
    mgr.enforce_subscription(tenant_id)
    return mgr.create_bot(tenant_id, payload, performed_by=tenant.email)


@app.post("/bots/{bot_id}/start", response_model=ActionResponse)
def start_bot(bot_id: str, mgr: BotManager = Depends(get_manager)) -> ActionResponse:
    return mgr.start_bot(bot_id, actor="system")


@app.post("/bots/{bot_id}/pause", response_model=ActionResponse)
def pause_bot(bot_id: str, mgr: BotManager = Depends(get_manager)) -> ActionResponse:
    return mgr.pause_bot(bot_id, actor="system")


@app.post("/bots/{bot_id}/restart", response_model=ActionResponse)
def restart_bot(bot_id: str, mgr: BotManager = Depends(get_manager)) -> ActionResponse:
    return mgr.restart_bot(bot_id, actor="system")


@app.get("/bots/{bot_id}/status", response_model=BotInstance)
def status(bot_id: str, mgr: BotManager = Depends(get_manager)) -> BotInstance:
    return mgr.status(bot_id)


@app.get("/bots/{bot_id}/logs", response_model=LogResponse)
def logs(bot_id: str, mgr: BotManager = Depends(get_manager)) -> LogResponse:
    content = mgr.logs(bot_id)
    bot = mgr.status(bot_id)
    return LogResponse(bot_id=bot_id, tenant_id=bot.tenant_id, content=content)


@app.get("/tenants/{tenant_id}/audit", response_model=AuditResponse)
def audit(tenant_id: str, bot_id: str | None = None, mgr: BotManager = Depends(get_manager)) -> AuditResponse:
    entries = mgr.audit(tenant_id=tenant_id, bot_id=bot_id)
    return AuditResponse(entries=entries)
