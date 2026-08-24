import hashlib
import hmac

from backend.app.razorpay_service import verify_payment_signature


def test_verify_payment_signature_accepts_valid_signature():
    secret = "test_secret"
    order_id = "order_123"
    payment_id = "pay_456"
    expected = hmac.new(
        secret.encode("utf-8"),
        f"{order_id}|{payment_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    assert verify_payment_signature(order_id, payment_id, expected, secret) is True


def test_verify_payment_signature_rejects_invalid_signature():
    assert (
        verify_payment_signature(
            "order_123",
            "pay_456",
            "bad_signature",
            "test_secret",
        )
        is False
    )
