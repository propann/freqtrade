from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from ...models import SubscriptionStatus
from ...services.billing_service import update_tenant_subscription, verify_paypal_signature
from ...services.bot_manager import BotManager

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])


def get_manager(request: Request) -> BotManager:
    return request.app.state.manager


@router.post("/paypal")
async def paypal_webhook(
    request: Request,
    x_paypal_signature: str | None = Header(None),
    manager: BotManager = Depends(get_manager),
) -> dict:
    payload = await request.body()
    if not verify_paypal_signature(payload, x_paypal_signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    body = json.loads(payload or b"{}")
    event_type = body.get("event_type")
    subscription_id = body.get("resource", {}).get("id")
    if not subscription_id:
        raise HTTPException(status_code=400, detail="Missing subscription id")

    if event_type == "BILLING.SUBSCRIPTION.ACTIVATED":
        update_tenant_subscription(manager.state, subscription_id, SubscriptionStatus.active)
    elif event_type in {"BILLING.SUBSCRIPTION.PAYMENT.FAILED", "BILLING.SUBSCRIPTION.CANCELLED"}:
        update_tenant_subscription(manager.state, subscription_id, SubscriptionStatus.suspended)
    elif event_type == "BILLING.SUBSCRIPTION.EXPIRED":
        update_tenant_subscription(manager.state, subscription_id, SubscriptionStatus.expired)

    return {"status": "processed"}
