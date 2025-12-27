from __future__ import annotations

from fastapi import HTTPException

from ..models import SubscriptionStatus
from ..services.state import StateStore


def ensure_active_subscription(state: StateStore, tenant_id: str) -> None:
    tenant = next((t for t in state.list_tenants() if t.tenant_id == tenant_id), None)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if tenant.subscription_status != SubscriptionStatus.active:
        raise HTTPException(
            status_code=402,
            detail="Paiement requis. Votre abonnement n'est pas actif.",
        )
