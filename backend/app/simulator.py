from random import Random
from uuid import uuid4


PAYMENT_METHODS = [
    "upi",
    "card",
    "netbanking",
    "wallet",
]


PAYMENT_FAILURES = {
    "card": [
        "bank_unavailable",
        "network_error",
        "authentication_failed",
        "insufficient_funds",
        "card_declined",
    ],

    "upi": [
        "bank_unavailable",
        "network_error",
        "authentication_failed",
        "insufficient_funds",
    ],

    "netbanking": [
        "bank_unavailable",
        "network_error",
        "authentication_failed",
        "insufficient_funds",
    ],

    "wallet": [
        "network_error",
        "authentication_failed",
        "insufficient_funds",
    ],
}


def simulate_transactions(
    count: int = 100,
    seed: int = 42,
):
    rng = Random(seed)

    transactions = []

    total_revenue = 0
    revenue_at_risk = 0
    failed_transactions = 0

    for _ in range(count):

        amount = rng.randint(
            100,
            10000,
        )

        payment_method = rng.choice(
            PAYMENT_METHODS
        )

        total_revenue += amount

        transaction = {
            "transaction_id":
                f"TXN_{uuid4().hex[:8].upper()}",

            "amount":
                amount,

            "payment_method":
                payment_method,
        }

        # Around 30% payment failure
        payment_failed = (
            rng.random() < 0.30
        )

        # ---------------------------------
        # SUCCESSFUL PAYMENT
        # ---------------------------------

        if not payment_failed:

            transaction.update(
                {
                    "status": "success",
                    "failure_reason": None,
                    "recovery_action": None,
                    "recovered": False,
                    "audit_trail": [
                        {
                            "event":
                                "PAYMENT_SUCCESS",

                            "message":
                                "Payment completed successfully.",
                        }
                    ],
                }
            )

            transactions.append(
                transaction
            )

            continue

        # ---------------------------------
        # FAILED PAYMENT
        # ---------------------------------

        failed_transactions += 1
        revenue_at_risk += amount

        failure_reason = rng.choice(
            PAYMENT_FAILURES[
                payment_method
            ]
        )

        transaction.update(
            {
                "status":
                    "at_risk",

                "failure_reason":
                    failure_reason,

                "recovery_action":
                    None,

                "recovered":
                    False,

                "audit_trail": [
                    {
                        "event":
                            "PAYMENT_FAILED",

                        "message":
                            f"Payment of ₹{amount} failed.",
                    },

                    {
                        "event":
                            "ROOT_CAUSE_IDENTIFIED",

                        "message":
                            (
                                "Failure classified as "
                                f"{failure_reason}."
                            ),
                    },

                    {
                        "event":
                            "REVENUE_AT_RISK",

                        "message":
                            (
                                f"₹{amount} marked as "
                                "revenue at risk."
                            ),
                    },
                ],
            }
        )

        transactions.append(
            transaction
        )

    metrics = {
        "total_transactions":
            count,

        "total_revenue":
            total_revenue,

        "failed_transactions":
            failed_transactions,

        "recovered_transactions":
            0,

        "revenue_at_risk":
            revenue_at_risk,

        "revenue_recovered":
            0,

        "transaction_recovery_rate_percent":
            0,

        "money_recovery_rate_percent":
            0,
    }

    return {
        "metrics":
            metrics,

        "transactions":
            transactions,
    }