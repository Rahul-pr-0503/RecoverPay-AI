import hashlib
import hmac
import os
import time

import razorpay


# =====================================================
# RAZORPAY CLIENT
# =====================================================

def get_razorpay_client():

    key_id = os.getenv(
        "RAZORPAY_KEY_ID"
    )

    key_secret = os.getenv(
        "RAZORPAY_KEY_SECRET"
    )


    if not key_id or not key_secret:

        raise RuntimeError(
            "Razorpay API credentials "
            "are not configured."
        )


    return razorpay.Client(
        auth=(
            key_id,
            key_secret,
        )
    )


# =====================================================
# CREATE RECOVERY PAYMENT LINK
# =====================================================

def create_recovery_payment_link(
    transaction_id: str,
    amount_rupees: float,
    recovery_action: str,
):

    client = get_razorpay_client()


    amount_paise = int(
        round(
            amount_rupees * 100
        )
    )


    # Razorpay reference_id must be unique.
    reference_id = (
        f"recoverpay_"
        f"{transaction_id[-10:]}_"
        f"{int(time.time())}"
    )


    payload = {
        "amount": amount_paise,

        "currency": "INR",

        "accept_partial": False,

        "reference_id": reference_id,

        "description": (
            "RecoverPay AI - "
            f"Recovery for {transaction_id}"
        ),

        "notes": {
            "recoverpay_transaction_id":
                transaction_id,

            "recovery_action":
                recovery_action,

            "source":
                "RecoverPay-AI",
        },
    }


    payment_link = (
        client.payment_link.create(
            payload
        )
    )


    return {
        "payment_link_id":
            payment_link.get("id"),

        "short_url":
            payment_link.get("short_url"),

        "status":
            payment_link.get("status"),

        "reference_id":
            payment_link.get(
                "reference_id"
            ),

        "amount":
            amount_rupees,
    }


# =====================================================
# STANDARD CHECKOUT SIGNATURE VERIFICATION
# =====================================================


def verify_payment_signature(
    order_id: str,
    payment_id: str,
    razorpay_signature: str,
    key_secret: str | None = None,
) -> bool:

    if not order_id or not payment_id or not razorpay_signature:
        return False

    secret = key_secret or os.getenv("RAZORPAY_KEY_SECRET")

    if not secret:
        return False

    payload = f"{order_id}|{payment_id}".encode("utf-8")
    expected_signature = hmac.new(
        secret.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(
        expected_signature,
        razorpay_signature,
    )