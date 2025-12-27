from __future__ import annotations

from fastapi import HTTPException

from ..models import SubscriptionStatus, Tenant


def ensure_active_subscription(tenant: Tenant) -> None:
    if tenant.subscription_status != SubscriptionStatus.active:
        raise HTTPException(
            status_code=402,
            detail="Paiement requis. Votre abonnement n'est pas actif.",
        )
