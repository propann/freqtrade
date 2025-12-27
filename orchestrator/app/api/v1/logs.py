from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from ...models import BotInstance
from ...services.bot_manager import BotManager
from ...utils.docker_client import stream_container_logs

router = APIRouter(prefix="/tenants/{tenant_id}/bots", tags=["logs"])


def get_manager(request: Request) -> BotManager:
    manager = getattr(request.app.state, "manager", None)
    if not manager:
        raise HTTPException(status_code=500, detail="Orchestrator manager unavailable")
    return manager


def verify_bot_ownership(
    tenant_id: str,
    bot_id: str,
    manager: BotManager = Depends(get_manager),
) -> BotInstance:
    bot = manager.state.get_bot(bot_id)
    if not bot or bot.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Bot not found for tenant")
    manager.enforce_subscription(tenant_id)
    return bot


@router.get("/{bot_id}/logs/stream")
async def get_bot_logs(
    tenant_id: str,
    bot_id: str,
    bot: BotInstance = Depends(verify_bot_ownership),
) -> StreamingResponse:
    return StreamingResponse(stream_container_logs(bot), media_type="text/event-stream")
