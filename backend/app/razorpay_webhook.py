import hashlib
import hmac
import json
import os

from dotenv import load_dotenv

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
)

from sqlalchemy.orm import Session

from backend.app.database import get_db

from backend.app.models import (
    AuditLog,
    RazorpayWebhookEvent,
    Transaction,
)


# =====================================================
# LOAD ENVIRONMENT VARIABLES
# =====================================================

load_dotenv()


# =====================================================
# ROUTER
# =====================================================

router = APIRouter(
    prefix="/razorpay",
    tags=["Razorpay"],
)


# =====================================================
# FAILURE CLASSIFICATION
# =====================================================

def classify_razorpay_failure(
    payment: dict,
) -> str:

    parts = [
        payment.get(
            "error_reason",
            "",
        ),
        payment.get(
            "error_description",
            "",
        ),
        payment.get(
            "error_source",
            "",
        ),
        payment.get(
            "error_step",
            "",
        ),
        payment.get(
            "error_code",
            "",
        ),
    ]


    text = " ".join(
        str(part)
        for part in parts
        if part
    ).lower()


    payment_method = (
        payment.get("method")
        or ""
    ).lower()


    # -------------------------------------------------
    # INSUFFICIENT FUNDS
    # -------------------------------------------------

    if (
        "insufficient" in text
        or "balance" in text
    ):

        return "insufficient_funds"


    # -------------------------------------------------
    # AUTHENTICATION FAILURE
    # -------------------------------------------------

    if any(
        word in text
        for word in [
            "authentication",
            "authenticate",
            "otp",
            "pin",
        ]
    ):

        return "authentication_failed"


    # -------------------------------------------------
    # NETWORK FAILURE
    # -------------------------------------------------

    if any(
        word in text
        for word in [
            "network",
            "timeout",
            "timed out",
            "connection",
        ]
    ):

        return "network_error"


    # -------------------------------------------------
    # BANK UNAVAILABLE
    # -------------------------------------------------

    if (
        "bank" in text
        and any(
            word in text
            for word in [
                "unavailable",
                "down",
                "offline",
                "temporarily unavailable",
            ]
        )
    ):

        return "bank_unavailable"


    # -------------------------------------------------
    # DECLINED PAYMENT
    # -------------------------------------------------

    if "declin" in text:

        if payment_method == "card":

            return "card_declined"


        if payment_method == "netbanking":

            return "bank_declined"


        return "payment_declined"


    # -------------------------------------------------
    # CONSERVATIVE FALLBACK
    # -------------------------------------------------

    return "unknown_failure"


# =====================================================
# NOTES HELPER
# =====================================================

def get_notes(
    entity: dict,
) -> dict:

    notes = entity.get(
        "notes"
    ) or {}


    if isinstance(
        notes,
        dict,
    ):

        return notes


    return {}


# =====================================================
# MARK ORIGINAL TRANSACTION AS RECOVERED
# =====================================================

def mark_original_as_recovered(
    db: Session,
    original_transaction: Transaction,
    amount: float,
    recovery_payment_id: str | None,
    payment_link_id: str | None,
    recovery_method: str,
    source_event: str,
):

    already_recovered = (
    original_transaction.recovered
    and original_transaction.status
    == "recovered"
)


    original_transaction.status = (
        "recovered"
    )

    original_transaction.recovered = (
        True
    )

    original_transaction.revenue_recovered = (
        amount
    )


    # Only log the actual recovery payment once.
    if not already_recovered:

        db.add(
            AuditLog(
                transaction_id=
                    original_transaction.transaction_id,

                event=
                    "RAZORPAY_RECOVERY_PAYMENT_RECEIVED",

                message=(
                    f"Recovery payment "
                    f"{recovery_payment_id or 'unknown'} "
                    f"received through Razorpay "
                    f"using {recovery_method}. "
                    f"Source event={source_event}. "
                    f"Payment link="
                    f"{payment_link_id or 'unknown'}."
                ),
            )
        )


        db.add(
            AuditLog(
                transaction_id=
                    original_transaction.transaction_id,

                event=
                    "RECOVERY_SUCCESS",

                message=(
                    f"₹{amount:.2f} successfully "
                    "recovered through Razorpay "
                    "Test Mode."
                ),
            )
        )


    # Avoid writing RECOVERY_SUCCESS twice if both
    # payment.captured and payment_link.paid arrive.
    if not already_recovered:

        db.add(
            AuditLog(
                transaction_id=
                    original_transaction.transaction_id,

                event=
                    "RECOVERY_SUCCESS",

                message=(
                    f"₹{amount:.2f} successfully "
                    "recovered through Razorpay "
                    "Test Mode."
                ),
            )
        )


# =====================================================
# WEBHOOK ENDPOINT
# =====================================================

@router.post("/webhook")
async def razorpay_webhook(
    request: Request,
    db: Session = Depends(get_db),
):

    # =================================================
    # WEBHOOK SECRET
    # =================================================

    webhook_secret = os.getenv(
        "RAZORPAY_WEBHOOK_SECRET"
    )


    if not webhook_secret:

        raise HTTPException(
            status_code=500,
            detail=(
                "RAZORPAY_WEBHOOK_SECRET "
                "is not configured"
            ),
        )


    # =================================================
    # RAW REQUEST BODY
    # =================================================

    raw_body = await request.body()


    signature = request.headers.get(
        "x-razorpay-signature"
    )


    if not signature:

        raise HTTPException(
            status_code=400,
            detail=(
                "Missing "
                "X-Razorpay-Signature"
            ),
        )


    # =================================================
    # VERIFY WEBHOOK SIGNATURE
    # =================================================

    expected_signature = (
        hmac.new(
            webhook_secret.encode(
                "utf-8"
            ),
            raw_body,
            hashlib.sha256,
        )
        .hexdigest()
    )


    if not hmac.compare_digest(
        expected_signature,
        signature,
    ):

        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid Razorpay "
                "webhook signature"
            ),
        )


    # =================================================
    # IDEMPOTENCY
    # =================================================

    event_id = request.headers.get(
        "x-razorpay-event-id"
    )


    # Fallback if Razorpay event ID is unavailable.
    if not event_id:

        event_id = hashlib.sha256(
            raw_body
        ).hexdigest()


    existing_event = (
        db.query(
            RazorpayWebhookEvent
        )
        .filter(
            RazorpayWebhookEvent.event_id
            == event_id
        )
        .first()
    )


    if existing_event:

        return {
            "status":
                "duplicate_ignored",

            "event_id":
                event_id,
        }


    # =================================================
    # PARSE JSON AFTER SIGNATURE VERIFICATION
    # =================================================

    try:

        payload = json.loads(
            raw_body.decode(
                "utf-8"
            )
        )

    except Exception:

        raise HTTPException(
            status_code=400,
            detail="Invalid JSON payload",
        )


    event_type = payload.get(
        "event"
    )


    payload_data = payload.get(
        "payload",
        {},
    )


    payment = (
        payload_data
        .get(
            "payment",
            {},
        )
        .get(
            "entity",
            {},
        )
    )


    payment_id = payment.get(
        "id"
    )


    response_status = (
        "processed"
    )


    response_extra = {}


    # =================================================
    # PAYMENT FAILED
    # =================================================

    if event_type == "payment.failed":

        if not payment_id:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Payment ID missing "
                    "from payment.failed webhook"
                ),
            )


        amount = (
            payment.get(
                "amount",
                0,
            )
            / 100
        )


        method = (
            payment.get(
                "method"
            )
            or "unknown"
        )


        failure_reason = (
            classify_razorpay_failure(
                payment
            )
        )


        transaction = (
            db.query(Transaction)
            .filter(
                Transaction.transaction_id
                == payment_id
            )
            .first()
        )


        # ---------------------------------------------
        # SUCCESSFUL STATE ALWAYS WINS
        # ---------------------------------------------

        if (
            transaction
            and transaction.status
            in {
                "success",
                "recovered",
            }
        ):

            db.add(
                AuditLog(
                    transaction_id=
                        payment_id,

                    event=
                        "LATE_FAILED_WEBHOOK_IGNORED",

                    message=(
                        "Received payment.failed "
                        "after the payment had already "
                        "reached a successful state."
                    ),
                )
            )


            response_status = (
                "late_failure_ignored"
            )


        else:

            # -----------------------------------------
            # CREATE NEW AT-RISK TRANSACTION
            # -----------------------------------------

            if not transaction:

                transaction = (
                    Transaction(
                        transaction_id=
                            payment_id,

                        amount=
                            amount,

                        payment_method=
                            method,

                        status=
                            "at_risk",

                        failure_reason=
                            failure_reason,

                        recovery_action=
                            None,

                        retry_count=
                            0,

                        recovered=
                            False,

                        revenue_recovered=
                            0,
                    )
                )


                db.add(
                    transaction
                )


            # -----------------------------------------
            # UPDATE EXISTING TRANSACTION
            # -----------------------------------------

            else:

                transaction.amount = (
                    amount
                )

                transaction.payment_method = (
                    method
                )

                transaction.status = (
                    "at_risk"
                )

                transaction.failure_reason = (
                    failure_reason
                )

                transaction.recovered = (
                    False
                )

                transaction.revenue_recovered = (
                    0
                )


            error_reason = (
                payment.get(
                    "error_reason"
                )
                or "not provided"
            )


            error_description = (
                payment.get(
                    "error_description"
                )
                or "not provided"
            )


            # -----------------------------------------
            # AUDIT WEBHOOK
            # -----------------------------------------

            db.add(
                AuditLog(
                    transaction_id=
                        payment_id,

                    event=
                        "RAZORPAY_WEBHOOK_RECEIVED",

                    message=(
                        "Received Razorpay "
                        "payment.failed webhook."
                    ),
                )
            )


            # -----------------------------------------
            # AUDIT FAILURE
            # -----------------------------------------

            db.add(
                AuditLog(
                    transaction_id=
                        payment_id,

                    event=
                        "PAYMENT_FAILED",

                    message=(
                        f"Razorpay Test Mode payment "
                        f"of ₹{amount:.2f} failed."
                    ),
                )
            )


            # -----------------------------------------
            # AUDIT ROOT CAUSE
            # -----------------------------------------

            db.add(
                AuditLog(
                    transaction_id=
                        payment_id,

                    event=
                        "ROOT_CAUSE_IDENTIFIED",

                    message=(
                        f"Mapped Razorpay failure "
                        f"to {failure_reason}. "
                        f"Raw reason={error_reason}. "
                        f"Description="
                        f"{error_description}."
                    ),
                )
            )


            # -----------------------------------------
            # AUDIT REVENUE RISK
            # -----------------------------------------

            db.add(
                AuditLog(
                    transaction_id=
                        payment_id,

                    event=
                        "REVENUE_AT_RISK",

                    message=(
                        f"₹{amount:.2f} marked "
                        "as revenue at risk."
                    ),
                )
            )


            response_extra = {
                "failure_reason":
                    failure_reason,

                "amount":
                    amount,
            }


    # =================================================
    # PAYMENT LINK PAID
    # =================================================

    elif event_type == "payment_link.paid":

        payment_link = (
            payload_data
            .get(
                "payment_link",
                {},
            )
            .get(
                "entity",
                {},
            )
        )


        recovery_payment = (
            payload_data
            .get(
                "payment",
                {},
            )
            .get(
                "entity",
                {},
            )
        )


        payment_link_id = (
            payment_link.get(
                "id"
            )
        )


        recovery_payment_id = (
            recovery_payment.get(
                "id"
            )
        )


        # ---------------------------------------------
        # FIND RECOVERPAY NOTES
        # ---------------------------------------------

        payment_link_notes = (
            get_notes(
                payment_link
            )
        )


        payment_notes = (
            get_notes(
                recovery_payment
            )
        )


        original_transaction_id = (
            payment_link_notes.get(
                "recoverpay_transaction_id"
            )
            or payment_notes.get(
                "recoverpay_transaction_id"
            )
        )


        # ---------------------------------------------
        # NORMAL PAYMENT LINK - NOT RECOVERPAY
        # ---------------------------------------------

        if not original_transaction_id:

            response_status = (
                "ignored_non_recoverpay_link"
            )


            response_extra = {
                "payment_link_id":
                    payment_link_id,

                "recovery_payment_id":
                    recovery_payment_id,
            }


        else:

            # -----------------------------------------
            # FIND ORIGINAL FAILED PAYMENT
            # -----------------------------------------

            original_transaction = (
                db.query(Transaction)
                .filter(
                    Transaction.transaction_id
                    == original_transaction_id
                )
                .first()
            )


            if not original_transaction:

                raise HTTPException(
                    status_code=404,
                    detail=(
                        "Original RecoverPay "
                        "transaction not found: "
                        f"{original_transaction_id}"
                    ),
                )


            amount = (
                recovery_payment.get(
                    "amount",
                    0,
                )
                / 100
            )


            recovery_method = (
                recovery_payment.get(
                    "method"
                )
                or "unknown"
            )


            # -----------------------------------------
            # MARK ORIGINAL PAYMENT RECOVERED
            # -----------------------------------------

            mark_original_as_recovered(
                db=db,

                original_transaction=
                    original_transaction,

                amount=
                    amount,

                recovery_payment_id=
                    recovery_payment_id,

                payment_link_id=
                    payment_link_id,

                recovery_method=
                    recovery_method,

                source_event=
                    "payment_link.paid",
            )


            db.add(
                AuditLog(
                    transaction_id=
                        original_transaction_id,

                    event=
                        "RAZORPAY_PAYMENT_LINK_PAID",

                    message=(
                        f"Razorpay Payment Link "
                        f"{payment_link_id} "
                        "was successfully paid."
                    ),
                )
            )


            response_status = (
                "recovery_completed"
            )


            response_extra = {
                "original_transaction_id":
                    original_transaction_id,

                "recovery_payment_id":
                    recovery_payment_id,

                "payment_link_id":
                    payment_link_id,

                "amount_recovered":
                    amount,
            }


            # Use recovery payment ID in webhook table.
            payment_id = (
                recovery_payment_id
            )


    # =================================================
    # PAYMENT CAPTURED
    # =================================================

    elif event_type == "payment.captured":

        if not payment_id:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Payment ID missing "
                    "from payment.captured webhook"
                ),
            )


        amount = (
            payment.get(
                "amount",
                0,
            )
            / 100
        )


        method = (
            payment.get(
                "method"
            )
            or "unknown"
        )


        payment_notes = (
            get_notes(
                payment
            )
        )


        recoverpay_parent = (
            payment_notes.get(
                "recoverpay_transaction_id"
            )
        )


        # ---------------------------------------------
        # RECOVERPAY RECOVERY PAYMENT
        # ---------------------------------------------

        if recoverpay_parent:

            original_transaction = (
                db.query(Transaction)
                .filter(
                    Transaction.transaction_id
                    == recoverpay_parent
                )
                .first()
            )


            if original_transaction:

                mark_original_as_recovered(
                    db=db,

                    original_transaction=
                        original_transaction,

                    amount=
                        amount,

                    recovery_payment_id=
                        payment_id,

                    payment_link_id=
                        None,

                    recovery_method=
                        method,

                    source_event=
                        "payment.captured",
                )


                response_status = (
                    "recovery_capture_processed"
                )


                response_extra = {
                    "original_transaction_id":
                        recoverpay_parent,

                    "amount_recovered":
                        amount,
                }


            else:

                response_status = (
                    "recovery_parent_not_found"
                )


                response_extra = {
                    "original_transaction_id":
                        recoverpay_parent,
                }


        # ---------------------------------------------
        # NORMAL RAZORPAY PAYMENT
        # ---------------------------------------------

        else:

            transaction = (
                db.query(Transaction)
                .filter(
                    Transaction.transaction_id
                    == payment_id
                )
                .first()
            )


            if transaction:

                # Existing failed payment later captured.
                if transaction.failure_reason:

                    transaction.status = (
                        "recovered"
                    )

                    transaction.recovered = (
                        True
                    )

                    transaction.revenue_recovered = (
                        amount
                    )


                    db.add(
                        AuditLog(
                            transaction_id=
                                payment_id,

                            event=
                                "RECOVERY_SUCCESS",

                            message=(
                                f"₹{amount:.2f} "
                                "successfully recovered "
                                "after Razorpay capture."
                            ),
                        )
                    )


                else:

                    transaction.status = (
                        "success"
                    )


            else:

                # -------------------------------------
                # NEW NORMAL SUCCESSFUL PAYMENT
                # -------------------------------------

                transaction = Transaction(
                    transaction_id=
                        payment_id,

                    amount=
                        amount,

                    payment_method=
                        method,

                    status=
                        "success",

                    failure_reason=
                        None,

                    recovery_action=
                        None,

                    retry_count=
                        0,

                    recovered=
                        False,

                    revenue_recovered=
                        0,
                )


                db.add(
                    transaction
                )


            db.add(
                AuditLog(
                    transaction_id=
                        payment_id,

                    event=
                        "RAZORPAY_PAYMENT_CAPTURED",

                    message=(
                        f"Razorpay confirmed "
                        f"payment capture for "
                        f"₹{amount:.2f}."
                    ),
                )
            )


    # =================================================
    # UNHANDLED RAZORPAY EVENT
    # =================================================

    else:

        response_status = (
            "event_acknowledged"
        )


    # =================================================
    # SAVE WEBHOOK EVENT
    # =================================================

    processed_event = (
        RazorpayWebhookEvent(
            event_id=
                event_id,

            event_type=
                event_type
                or "unknown",

            payment_id=
                payment_id,
        )
    )


    db.add(
        processed_event
    )


    # =================================================
    # COMMIT DATABASE CHANGES
    # =================================================

    try:

        db.commit()

    except Exception as error:

        db.rollback()

        print(
            "Razorpay webhook DB error:",
            error,
        )


        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to persist "
                "Razorpay webhook"
            ),
        )


    # =================================================
    # RESPONSE
    # =================================================

    return {
        "status":
            response_status,

        "event_id":
            event_id,

        "event_type":
            event_type,

        "payment_id":
            payment_id,

        **response_extra,
    }