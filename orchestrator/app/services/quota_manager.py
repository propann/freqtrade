from __future__ import annotations

from fastapi import HTTPException

from ..models import BotStatus, TenantQuotas
from .state import StateStore


class QuotaManager:
    """Apply tenant quotas before provisioning new bot containers."""

    def __init__(self, state: StateStore):
        self.state = state

    def get_active_bots_count(self, tenant_id: str) -> int:
        return sum(
            1 for bot in self.state.list_bots(tenant_id) if bot.status == BotStatus.running
        )

    def validate_spawn_request(self, tenant_id: str, quotas: TenantQuotas) -> None:
        active_bots = self.get_active_bots_count(tenant_id)
        if active_bots >= quotas.max_bots:
            raise HTTPException(
                status_code=403,
                detail=f"Limite de bots atteinte ({quotas.max_bots}). Passez au forfait supérieur.",
            )

    @staticmethod
    def get_docker_resource_config(quotas: TenantQuotas) -> dict:
        return {
            "mem_limit": quotas.mem_limit,
            "cpu_quota": int(quotas.cpu_limit * 100000),
            "cpu_period": 100000,
            "pids_limit": quotas.pids_limit,
        }
