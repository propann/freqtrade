from __future__ import annotations

import hashlib
import hmac
import os

from fastapi import HTTPException

from ..models import SubscriptionStatus, Tenant
from .state import StateStore


def verify_paypal_signature(raw_body: bytes, signature: str | None) -> bool:
    secret = os.environ.get("PAYPAL_WEBHOOK_SECRET")
    if not secret or not signature:
        return False
    computed = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed, signature)


def update_tenant_subscription(
    state: StateStore,
    subscription_id: str,
    status: SubscriptionStatus,
) -> Tenant:
    tenant = state.get_tenant_by_subscription_id(subscription_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Subscription not linked to any tenant")
    tenant.subscription_status = status
    return state.upsert_tenant(tenant)
