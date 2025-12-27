from __future__ import annotations

import hmac
import os
from hashlib import sha256
from typing import Optional

from fastapi import HTTPException

from ..models import SubscriptionStatus, Tenant
from .state import StateStore


def verify_paypal_signature(payload: bytes, signature: Optional[str]) -> bool:
    secret = os.environ.get("PAYPAL_WEBHOOK_SECRET")
    if not secret or not signature:
        return False
    digest = hmac.new(secret.encode("utf-8"), msg=payload, digestmod=sha256).hexdigest()
    return hmac.compare_digest(digest, signature)


def update_tenant_subscription(
    state: StateStore,
    subscription_id: str,
    status: SubscriptionStatus,
) -> Tenant:
    tenant = next((t for t in state.list_tenants() if t.subscription_id == subscription_id), None)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant subscription not found")
    updated = tenant.copy(update={"subscription_status": status})
    return state.upsert_tenant(updated)
