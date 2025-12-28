from __future__ import annotations

import os
import re
import subprocess
import uuid
import json
from pathlib import Path
from typing import List

from fastapi import HTTPException

from ..models import (
    ActionResponse,
    AuditEntry,
    BotConfig,
    BotInstance,
    BotRiskLimits,
    BotStatus,
    CreateBotRequest,
    SubscriptionStatus,
    Tenant,
    TenantPlan,
    TenantQuotas,
)
from ..utils.guards import ensure_active_subscription
from .state import StateStore
from .quota_manager import QuotaManager


class BotManager:
    """Coordinator responsible for tenant isolation and lifecycle transitions."""

    PLAN_QUOTAS: dict[TenantPlan, TenantQuotas] = {
        TenantPlan.basic: TenantQuotas(
            max_bots=1,
            cpu_limit=0.5,
            mem_limit="512m",
            pids_limit=60,
            allow_hyperopt=False,
            allow_backtest=False,
        ),
        TenantPlan.pro: TenantQuotas(
            max_bots=3,
            cpu_limit=1.0,
            mem_limit="1024m",
            pids_limit=120,
            allow_hyperopt=True,
            allow_backtest=True,
        ),
        TenantPlan.whale: TenantQuotas(
            max_bots=10,
            cpu_limit=2.0,
            mem_limit="4096m",
            pids_limit=240,
            allow_hyperopt=True,
            allow_backtest=True,
        ),
    }

    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self.state = StateStore(base_dir / "state")
        self.clients_dir = base_dir / ".." / "clients"
        self.clients_dir.mkdir(parents=True, exist_ok=True)
        self.quota_manager = QuotaManager(self.state)
        self.templates_dir = base_dir.parent / "templates"

    def create_tenant(
        self,
        tenant_id: str,
        email: str,
        subscription_id: str | None = None,
        subscription_status: Tenant.__fields__["subscription_status"].type_ | None = None,
        plan: TenantPlan | None = None,
    ) -> Tenant:
        tenant = Tenant(
            tenant_id=tenant_id,
            email=email,
            subscription_id=subscription_id,
            subscription_status=subscription_status or Tenant.__fields__["subscription_status"].type_.suspended,
            plan=plan or TenantPlan.basic,
        )
        return self.state.upsert_tenant(tenant)

    def _tenant_dir(self, tenant_id: str) -> Path:
        tdir = self.clients_dir / tenant_id
        tdir.mkdir(parents=True, exist_ok=True)
        return tdir

    def _session_dir(self, tenant_id: str, session_id: str) -> Path:
        session_dir = self._tenant_dir(tenant_id) / session_id
        (session_dir / "data").mkdir(parents=True, exist_ok=True)
        (session_dir / "logs").mkdir(parents=True, exist_ok=True)
        return session_dir

    @staticmethod
    def _normalize_name(value: str) -> str:
        normalized = re.sub(r"[^a-zA-Z0-9_.-]+", "-", value).strip("-").lower()
        return normalized[:63] or "freqtrade-session"

    def _compose_project_name(self, tenant_id: str, bot_id: str) -> str:
        return self._normalize_name(f"fta-{tenant_id}-{bot_id}")

    def _network_name(self, tenant_id: str, bot_id: str) -> str:
        return self._normalize_name(f"fta-session-{tenant_id}-{bot_id}")

    def _render_template(self, template_path: Path, replacements: dict[str, str]) -> str:
        content = template_path.read_text()
        for key, value in replacements.items():
            content = content.replace(key, value)
        return content

    def _build_config(self, tenant_id: str, bot_id: str, payload: CreateBotRequest, quotas: TenantQuotas) -> BotConfig:
        session_dir = self._session_dir(tenant_id, bot_id)
        config_path = session_dir / "config.json"
        compose_path = session_dir / "docker-compose.yml"

        config_template = self.templates_dir / "freqtrade-config.template.json"
        config_payload = self._render_template(
            config_template,
            {
                "{{tenant_id}}": tenant_id,
                "{{bot_id}}": bot_id,
                "{{strategy}}": payload.strategy,
                "{{max_concurrent_pairs}}": str(payload.risk.max_concurrent_pairs),
                "{{max_drawdown_percent}}": str(payload.risk.max_drawdown_percent),
            },
        )
        config_path.write_text(config_payload)

        compose_template = self.templates_dir / "client-compose.yml"
        project_name = self._compose_project_name(tenant_id, bot_id)
        network_name = self._network_name(tenant_id, bot_id)
        compose_payload = self._render_template(
            compose_template,
            {
                "${FREQTRADE_IMAGE:-freqtradeorg/freqtrade:stable}": "freqtradeorg/freqtrade:stable",
                "${CONTAINER_NAME}": project_name,
                "${CONFIG_DIR}": str(session_dir),
                "${DATA_DIR}": str(session_dir / "data"),
                "${LOGS_DIR}": str(session_dir / "logs"),
                "${MEM_LIMIT}": quotas.mem_limit,
                "${CPU_LIMIT}": str(quotas.cpu_limit),
                "${PIDS_LIMIT}": str(quotas.pids_limit),
                "${NETWORK_NAME}": network_name,
            },
        )
        compose_path.write_text(compose_payload)

        return BotConfig(
            bot_id=bot_id,
            tenant_id=tenant_id,
            strategy=payload.strategy,
            template=payload.template,
            config_path=str(config_path),
            compose_path=str(compose_path),
            project_name=project_name,
            network=network_name,
            state_path=str(session_dir / "data"),
            risk=payload.risk,
        )

    def create_bot(self, tenant_id: str, payload: CreateBotRequest, performed_by: str) -> ActionResponse:
        bot_id = str(uuid.uuid4())
        quotas = self.get_tenant_quotas(tenant_id)
        config = self._build_config(tenant_id, bot_id, payload, quotas)
        instance = BotInstance(
            bot_id=bot_id,
            tenant_id=tenant_id,
            config=config,
            status=BotStatus.created,
            logs_path=str(Path(config.state_path).parent / "logs" / "freqtrade.log"),
        )
        self.state.save_bot(instance)
        audit = self.state.add_audit(
            AuditEntry(
                tenant_id=tenant_id,
                bot_id=bot_id,
                action="create",
                performed_by=performed_by,
                metadata={"template": payload.template, "strategy": payload.strategy},
            )
        )
        return ActionResponse(bot_id=bot_id, status=instance.status, message="Bot created", audit_ref=str(audit.ts))

    def _transition(
        self,
        bot_id: str,
        status: BotStatus,
        actor: str,
        message: str,
        metadata: dict[str, str] | None = None,
    ) -> ActionResponse:
        bot = self.state.get_bot(bot_id)
        if not bot:
            raise HTTPException(status_code=404, detail="Bot not found")
        updated = self.state.set_bot_status(bot_id, status)
        audit = self.state.add_audit(
            AuditEntry(
                tenant_id=bot.tenant_id,
                bot_id=bot.bot_id,
                action=status.value,
                performed_by=actor,
                metadata=metadata or {},
            )
        )
        return ActionResponse(bot_id=bot_id, status=updated.status, message=message, audit_ref=str(audit.ts))

    def get_tenant_quotas(self, tenant_id: str) -> TenantQuotas:
        tenants = {t.tenant_id: t for t in self.state.list_tenants()}
        tenant = tenants.get(tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        return self.PLAN_QUOTAS.get(tenant.plan, self.PLAN_QUOTAS[TenantPlan.basic])

    def _enforce_quota_for_bot(self, bot_id: str) -> tuple[BotInstance, TenantQuotas]:
        bot = self.state.get_bot(bot_id)
        if not bot:
            raise HTTPException(status_code=404, detail="Bot not found")
        self.enforce_subscription(bot.tenant_id)
        if bot.status != BotStatus.running:
            quotas = self.get_tenant_quotas(bot.tenant_id)
            self.quota_manager.validate_spawn_request(bot.tenant_id, quotas)
            return bot, quotas
        return bot, self.get_tenant_quotas(bot.tenant_id)

    def _run_docker_compose(self, bot: BotInstance, args: list[str]) -> None:
        if os.environ.get("ORCHESTRATOR_RUN_DOCKER", "").lower() not in {"1", "true", "yes"}:
            return
        compose_path = Path(bot.config.compose_path)
        if not compose_path.exists():
            raise HTTPException(status_code=404, detail="Docker compose template not found")
        cmd = ["docker", "compose", "-p", bot.config.project_name, "-f", str(compose_path), *args]
        subprocess.run(cmd, check=True, cwd=compose_path.parent)

    def start_bot(self, bot_id: str, actor: str) -> ActionResponse:
        bot, quotas = self._enforce_quota_for_bot(bot_id)
        self.prepare_bot_config(bot_id)
        self._run_docker_compose(bot, ["up", "-d"])
        resource_limits = self.quota_manager.get_docker_resource_config(quotas)
        return self._transition(
            bot_id,
            BotStatus.running,
            actor,
            "Bot started",
            metadata={"resource_limits": json.dumps(resource_limits)},
        )

    def pause_bot(self, bot_id: str, actor: str) -> ActionResponse:
        return self._transition(bot_id, BotStatus.paused, actor, "Bot paused")

    def stop_bot(self, bot_id: str, actor: str) -> ActionResponse:
        bot = self.state.get_bot(bot_id)
        if not bot:
            raise HTTPException(status_code=404, detail="Bot not found")
        self._run_docker_compose(bot, ["down"])
        return self._transition(bot_id, BotStatus.stopped, actor, "Bot stopped")

    def restart_bot(self, bot_id: str, actor: str) -> ActionResponse:
        bot = self.state.get_bot(bot_id)
        if not bot:
            raise HTTPException(status_code=404, detail="Bot not found")
        self.enforce_subscription(bot.tenant_id)
        return self._transition(bot_id, BotStatus.running, actor, "Bot restarted")

    def status(self, bot_id: str) -> BotInstance:
        bot = self.state.get_bot(bot_id)
        if not bot:
            raise HTTPException(status_code=404, detail="Bot not found")
        return bot

    def prepare_bot_config(self, bot_id: str) -> dict:
        bot = self.state.get_bot(bot_id)
        if not bot:
            raise HTTPException(status_code=404, detail="Bot not found")
        config_path = Path(bot.config.config_path)
        if not config_path.exists():
            raise HTTPException(status_code=404, detail="Config template not found")
        return json.loads(config_path.read_text())

    def backtest_bot(self, bot_id: str, actor: str) -> ActionResponse:
        bot = self.state.get_bot(bot_id)
        if not bot:
            raise HTTPException(status_code=404, detail="Bot not found")
        self.enforce_subscription(bot.tenant_id)
        quotas = self.get_tenant_quotas(bot.tenant_id)
        if not quotas.allow_backtest:
            raise HTTPException(status_code=403, detail="Backtesting non autorisé pour ce forfait.")
        self._run_docker_compose(
            bot,
            [
                "run",
                "--rm",
                "freqtrade",
                "backtesting",
                "--config",
                "/freqtrade/config/config.json",
                "--logfile",
                "/freqtrade/user_data/logs/backtest.log",
            ],
        )
        audit = self.state.add_audit(
            AuditEntry(
                tenant_id=bot.tenant_id,
                bot_id=bot.bot_id,
                action="backtest",
                performed_by=actor,
                metadata={"logs": "backtest.log"},
            )
        )
        return ActionResponse(bot_id=bot_id, status=bot.status, message="Backtest executed", audit_ref=str(audit.ts))

    def logs(self, bot_id: str) -> List[str]:
        bot = self.state.get_bot(bot_id)
        if not bot:
            raise HTTPException(status_code=404, detail="Bot not found")
        if bot.logs_path and Path(bot.logs_path).exists():
            return Path(bot.logs_path).read_text().splitlines()[-200:]
        return ["No logs captured yet"]

    def audit(self, tenant_id: str, bot_id: str | None = None) -> List[AuditEntry]:
        return self.state.list_audit(tenant_id=tenant_id, bot_id=bot_id)

    def enforce_subscription(self, tenant_id: str) -> None:
        tenants = {t.tenant_id: t for t in self.state.list_tenants()}
        tenant = tenants.get(tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        ensure_active_subscription(tenant)

    def seed_demo(self) -> None:
        """Preload a demo tenant for local development."""
        tenant = Tenant(
            tenant_id="demo",
            email="demo@example.com",
            subscription_status=Tenant.__fields__["subscription_status"].type_.active,
        )
        self.state.upsert_tenant(tenant)
