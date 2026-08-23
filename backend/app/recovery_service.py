import hashlib

from sqlalchemy.orm import Session

from backend.app.ai_agent import get_ai_recovery_decision
from backend.app.models import AuditLog, Transaction
from backend.app.recovery_engine import get_recovery_strategy
from backend.app.schemas import RecoveryDecision


def deterministic_roll(
    transaction_id: str,
    attempt_number: int,
) -> float:
    """
    Generates a deterministic value between 0 and 1.

    This makes demo/testing recovery outcomes reproducible.
    """

    value = f"{transaction_id}:{attempt_number}"

    digest = hashlib.sha256(
        value.encode("utf-8")
    ).hexdigest()

    number = int(
        digest[:8],
        16,
    )

    return number / 0xFFFFFFFF


def process_recovery(
    db: Session,
    transaction: Transaction,
    decision: RecoveryDecision | None = None,
    log_ai_decision: bool = True,
):

    # ----------------------------------------
    # BASIC VALIDATION
    # ----------------------------------------

    if transaction.failure_reason is None:

        raise ValueError(
            "Successful transaction does not require recovery."
        )

    if transaction.recovered:

        return {
            "transaction_id":
                transaction.transaction_id,

            "status":
                "already_recovered",

            "recovered":
                True,

            "revenue_recovered":
                transaction.revenue_recovered,
        }

    if transaction.status == "escalated":

        return {
            "transaction_id":
                transaction.transaction_id,

            "status":
                "escalated",

            "recovered":
                False,

            "revenue_recovered":
                transaction.revenue_recovered,
        }

    # ----------------------------------------
    # AI DECISION
    # ----------------------------------------

    if decision is None:

        decision = get_ai_recovery_decision(
            transaction_id=
                transaction.transaction_id,

            amount=
                transaction.amount,

            payment_method=
                transaction.payment_method,

            failure_reason=
                transaction.failure_reason,

            retry_count=
                transaction.retry_count,

            max_retries=
                transaction.max_retries,
        )

    if log_ai_decision:

        ai_log = AuditLog(
            transaction_id=
                transaction.transaction_id,

            event=
                "AI_DECISION_GENERATED",

            message=(
                f"AI recommended {decision.action}. "
                f"Confidence={decision.confidence:.2f}. "
                f"Risk={decision.risk_level}. "
                f"Reason={decision.reason}"
            ),
        )

        db.add(ai_log)

    # ----------------------------------------
    # CONSERVATIVE AI STOP / ESCALATION
    # ----------------------------------------

    if (
        decision.should_escalate
        or decision.action
        in {
            "ESCALATE_TO_HUMAN",
            "STOP_RECOVERY",
        }
    ):

        transaction.status = "escalated"

        transaction.recovery_action = (
            "ESCALATE_TO_HUMAN"
        )

        log = AuditLog(
            transaction_id=
                transaction.transaction_id,

            event=
                "HUMAN_ESCALATION",

            message=(
                "AI requested that automatic "
                "recovery stop and the payment "
                "be escalated for human review."
            ),
        )

        db.add(log)

        db.commit()
        db.refresh(transaction)

        return {
            "transaction_id":
                transaction.transaction_id,

            "status":
                transaction.status,

            "ai_action":
                decision.action,

            "approved_action":
                "ESCALATE_TO_HUMAN",

            "retry_count":
                transaction.retry_count,

            "recovered":
                False,

            "revenue_recovered":
                0,
        }

    # ----------------------------------------
    # BACKEND POLICY ENGINE
    # ----------------------------------------

    policy = get_recovery_strategy(
        failure_reason=
            transaction.failure_reason,

        retry_count=
            transaction.retry_count,
    )

    # Backend stopping rule overrides AI
    if policy["stop"]:

        transaction.status = "escalated"

        transaction.recovery_action = (
            "ESCALATE_TO_HUMAN"
        )

        stop_log = AuditLog(
            transaction_id=
                transaction.transaction_id,

            event=
                "RECOVERY_STOPPED",

            message=
                policy["reason"],
        )

        db.add(stop_log)

        db.commit()
        db.refresh(transaction)

        return {
            "transaction_id":
                transaction.transaction_id,

            "status":
                "escalated",

            "ai_action":
                decision.action,

            "approved_action":
                "ESCALATE_TO_HUMAN",

            "reason":
                policy["reason"],

            "retry_count":
                transaction.retry_count,

            "recovered":
                False,

            "revenue_recovered":
                0,
        }

    approved_action = policy["action"]

    transaction.max_retries = (
        policy["max_retries"]
    )

    # ----------------------------------------
    # POLICY VALIDATION
    # ----------------------------------------

    policy_overridden = (
        decision.action
        != approved_action
    )

    if policy_overridden:

        validation_log = AuditLog(
            transaction_id=
                transaction.transaction_id,

            event=
                "POLICY_OVERRIDE",

            message=(
                f"AI suggested {decision.action}, "
                f"but backend policy approved "
                f"{approved_action}."
            ),
        )

    else:

        validation_log = AuditLog(
            transaction_id=
                transaction.transaction_id,

            event=
                "POLICY_VALIDATED",

            message=(
                f"AI action {decision.action} "
                "passed backend safety policy."
            ),
        )

    db.add(validation_log)

    # ----------------------------------------
    # EXECUTE RECOVERY
    # ----------------------------------------

    transaction.retry_count += 1

    transaction.recovery_action = (
        approved_action
    )

    attempt_number = (
        transaction.retry_count
    )

    attempt_log = AuditLog(
        transaction_id=
            transaction.transaction_id,

        event=
            "RECOVERY_ATTEMPT",

        message=(
            f"Attempt {attempt_number}: "
            f"{approved_action}"
        ),
    )

    db.add(attempt_log)

    recovery_probability = (
        policy[
            "recovery_probability"
        ]
    )

    roll = deterministic_roll(
        transaction.transaction_id,
        attempt_number,
    )

    recovered = (
        roll
        < recovery_probability
    )

    # ----------------------------------------
    # SUCCESS
    # ----------------------------------------

    if recovered:

        transaction.status = "recovered"

        transaction.recovered = True

        transaction.revenue_recovered = (
            transaction.amount
        )

        success_log = AuditLog(
            transaction_id=
                transaction.transaction_id,

            event=
                "RECOVERY_SUCCESS",

            message=(
                f"₹{transaction.amount} "
                "successfully recovered using "
                f"{approved_action}."
            ),
        )

        db.add(success_log)

    # ----------------------------------------
    # FAILED ATTEMPT
    # ----------------------------------------

    else:

        failure_log = AuditLog(
            transaction_id=
                transaction.transaction_id,

            event=
                "RECOVERY_ATTEMPT_FAILED",

            message=(
                f"Attempt {attempt_number} "
                "did not recover the payment."
            ),
        )

        db.add(failure_log)

        # Stop automatically after max retries
        if (
            transaction.retry_count
            >= transaction.max_retries
        ):

            transaction.status = (
                "escalated"
            )

            transaction.recovery_action = (
                "ESCALATE_TO_HUMAN"
            )

            escalation_log = AuditLog(
                transaction_id=
                    transaction.transaction_id,

                event=
                    "RECOVERY_STOPPED",

                message=(
                    "Maximum recovery attempts "
                    "reached. Transaction escalated "
                    "for human review."
                ),
            )

            db.add(escalation_log)

        else:

            transaction.status = (
                "recovery_pending"
            )

    db.commit()

    db.refresh(transaction)

    return {
        "transaction_id":
            transaction.transaction_id,

        "status":
            transaction.status,

        "failure_reason":
            transaction.failure_reason,

        "ai_action":
            decision.action,

        "approved_action":
            approved_action,

        "policy_overridden":
            policy_overridden,

        "decision_source":
            decision.decision_source,

        "ai_confidence":
            decision.confidence,

        "risk_level":
            decision.risk_level,

        "retry_delay_minutes":
            decision.retry_delay_minutes,

        "retry_count":
            transaction.retry_count,

        "max_retries":
            transaction.max_retries,

        "recovered":
            transaction.recovered,
        "revenue_recovered":
            transaction.revenue_recovered,
    }