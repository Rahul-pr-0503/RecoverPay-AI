RECOVERY_RULES = {

    "bank_unavailable": {
        "action": "SMART_RETRY",
        "max_retries": 3,
        "recovery_probability": 0.80
    },

    "network_error": {
        "action": "SMART_RETRY",
        "max_retries": 3,
        "recovery_probability": 0.75
    },

    "authentication_failed": {
        "action": "SEND_PAYMENT_LINK",
        "max_retries": 2,
        "recovery_probability": 0.55
    },

    "insufficient_funds": {
        "action": "SEND_REMINDER",
        "max_retries": 1,
        "recovery_probability": 0.35
    },

    "card_declined": {
        "action": "RECOMMEND_ALTERNATE_METHOD",
        "max_retries": 1,
        "recovery_probability": 0.45
    }
}


def get_recovery_strategy(
    failure_reason: str,
    retry_count: int
):

    policy = RECOVERY_RULES.get(failure_reason)

    if not policy:

        return {
            "action": "ESCALATE_TO_HUMAN",
            "stop": True,
            "reason": "Unknown failure type"
        }

    if retry_count >= policy["max_retries"]:

        return {
            "action": "ESCALATE_TO_HUMAN",
            "stop": True,
            "reason": "Maximum recovery attempts reached"
        }

    return {
        "action": policy["action"],
        "stop": False,
        "max_retries": policy["max_retries"],
        "recovery_probability": policy[
            "recovery_probability"
        ]
    }