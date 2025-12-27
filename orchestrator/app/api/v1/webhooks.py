from __future__ import annotations

import json

from fastapi import APIRouter, Header, HTTPException, Request

from ...models import SubscriptionStatus
from ...services.billing_service import update_tenant_subscription, verify_paypal_signature
router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])


@router.post("/paypal")
async def paypal_webhook(
    request: Request,
    x_paypal_signature: str | None = Header(default=None),
) -> dict:
    raw_body = await request.body()
    if not verify_paypal_signature(raw_body, x_paypal_signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    body = json.loads(raw_body)
    event_type = body.get("event_type")
    resource = body.get("resource") or {}
    subscription_id = resource.get("id")
    if not subscription_id:
        raise HTTPException(status_code=400, detail="Missing subscription id")

    status = None
    if event_type == "BILLING.SUBSCRIPTION.ACTIVATED":
        status = SubscriptionStatus.active
    elif event_type in {
        "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
        "BILLING.SUBSCRIPTION.CANCELLED",
    }:
        status = SubscriptionStatus.suspended
    elif event_type == "BILLING.SUBSCRIPTION.EXPIRED":
        status = SubscriptionStatus.expired

    if status is not None:
        update_tenant_subscription(request.app.state.store, subscription_id=subscription_id, status=status)

    return {"status": "processed"}
