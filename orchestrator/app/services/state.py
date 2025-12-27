from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional

from ..models import AuditEntry, BotInstance, BotStatus, BotConfig, Tenant


class StateStore:
    """Minimal JSON-backed store for tenants, bots, and audit logs."""

    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._tenants: Dict[str, Tenant] = {}
        self._bots: Dict[str, BotInstance] = {}
        self._audit: List[AuditEntry] = []
        self._state_file = self.base_dir / "state.json"
        self._load()

    def _load(self) -> None:
        if not self._state_file.exists():
            return
        content = json.loads(self._state_file.read_text())
        self._tenants = {t["tenant_id"]: Tenant(**t) for t in content.get("tenants", [])}
        self._bots = {b["bot_id"]: BotInstance(**b) for b in content.get("bots", [])}
        self._audit = [AuditEntry(**a) for a in content.get("audit", [])]

    def _persist(self) -> None:
        payload = {
            "tenants": [t.dict() for t in self._tenants.values()],
            "bots": [b.dict() for b in self._bots.values()],
            "audit": [a.dict() for a in self._audit],
        }
        self._state_file.write_text(json.dumps(payload, default=str, indent=2))

    def list_tenants(self) -> List[Tenant]:
        return list(self._tenants.values())

    def upsert_tenant(self, tenant: Tenant) -> Tenant:
        self._tenants[tenant.tenant_id] = tenant
        self._persist()
        return tenant

    def get_tenant_by_subscription_id(self, subscription_id: str) -> Optional[Tenant]:
        return next((tenant for tenant in self._tenants.values() if tenant.subscription_id == subscription_id), None)

    def get_bot(self, bot_id: str) -> Optional[BotInstance]:
        return self._bots.get(bot_id)

    def list_bots(self, tenant_id: Optional[str] = None) -> List[BotInstance]:
        if tenant_id is None:
            return list(self._bots.values())
        return [b for b in self._bots.values() if b.tenant_id == tenant_id]

    def save_bot(self, bot: BotInstance) -> BotInstance:
        self._bots[bot.bot_id] = bot
        self._persist()
        return bot

    def set_bot_status(self, bot_id: str, status: BotStatus) -> BotInstance:
        bot = self._bots[bot_id]
        bot.status = status
        self._bots[bot_id] = bot
        self._persist()
        return bot

    def add_audit(self, entry: AuditEntry) -> AuditEntry:
        self._audit.append(entry)
        self._persist()
        return entry

    def list_audit(self, tenant_id: str, bot_id: Optional[str] = None) -> List[AuditEntry]:
        return [a for a in self._audit if a.tenant_id == tenant_id and (bot_id is None or a.bot_id == bot_id)]
