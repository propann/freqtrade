from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, validator


class SubscriptionStatus(str, Enum):
    active = "active"
    suspended = "suspended"
    cancelled = "cancelled"
    expired = "expired"


class TenantPlan(str, Enum):
    basic = "basic"
    pro = "pro"
    whale = "whale"


class TenantQuotas(BaseModel):
    max_bots: int = Field(..., ge=1)
    cpu_limit: float = Field(..., gt=0)
    mem_limit: str
    pids_limit: int = Field(..., ge=10)
    allow_hyperopt: bool = False
    allow_backtest: bool = False


class Tenant(BaseModel):
    tenant_id: str
    email: str
    subscription_id: Optional[str] = None
    subscription_status: SubscriptionStatus = SubscriptionStatus.suspended
    plan: TenantPlan = TenantPlan.basic
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TenantBilling(BaseModel):
    tenant_id: str
    subscription_id: str
    status: SubscriptionStatus
    plan_id: str


class BotRiskLimits(BaseModel):
    max_concurrent_pairs: int = Field(..., ge=1, le=40)
    max_drawdown_percent: float = Field(..., ge=0, le=100)
    max_daily_trades: int = Field(..., ge=1, le=500)
    stake_amount: float = Field(..., gt=0)

    @validator("max_drawdown_percent")
    def validate_drawdown(cls, value: float) -> float:
        if value > 50:
            raise ValueError("Drawdown limit above 50% is not allowed for safety")
        return value


class BotConfig(BaseModel):
    bot_id: str
    tenant_id: str
    strategy: str
    template: str
    config_path: str
    compose_path: str
    project_name: str
    network: str
    state_path: str
    risk: BotRiskLimits


class BotStatus(str, Enum):
    created = "created"
    running = "running"
    paused = "paused"
    stopped = "stopped"


class BotInstance(BaseModel):
    bot_id: str
    tenant_id: str
    status: BotStatus = BotStatus.created
    last_action_at: datetime = Field(default_factory=datetime.utcnow)
    config: BotConfig
    logs_path: Optional[str] = None


class AuditEntry(BaseModel):
    tenant_id: str
    bot_id: Optional[str] = None
    action: str
    performed_by: str
    ts: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, str] = Field(default_factory=dict)


class CreateBotRequest(BaseModel):
    strategy: str = Field(..., description="Freqtrade strategy name")
    template: str = Field(..., description="Config template name")
    risk: BotRiskLimits


class ActionResponse(BaseModel):
    bot_id: str
    status: BotStatus
    message: str
    audit_ref: str


class LogResponse(BaseModel):
    bot_id: str
    tenant_id: str
    content: List[str]


class AuditResponse(BaseModel):
    entries: List[AuditEntry]
