import json
import os
import time

from dotenv import load_dotenv
from groq import Groq

from backend.app.schemas import RecoveryDecision


load_dotenv()


MODEL_NAME = "openai/gpt-oss-20b"


ALLOWED_ACTIONS = {
    "SMART_RETRY",
    "SEND_PAYMENT_LINK",
    "SEND_REMINDER",
    "RECOMMEND_ALTERNATE_METHOD",
    "ESCALATE_TO_HUMAN",
    "STOP_RECOVERY",
}


RECOVERY_SCHEMA = {
    "type": "object",

    "properties": {

        "diagnosis": {
            "type": "string"
        },

        "action": {
            "type": "string",
            "enum": [
                "SMART_RETRY",
                "SEND_PAYMENT_LINK",
                "SEND_REMINDER",
                "RECOMMEND_ALTERNATE_METHOD",
                "ESCALATE_TO_HUMAN",
                "STOP_RECOVERY",
            ],
        },

        "reason": {
            "type": "string"
        },

        "confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
        },

        "risk_level": {
            "type": "string",
            "enum": [
                "low",
                "medium",
                "high",
            ],
        },

        "retry_delay_minutes": {
            "type": "integer",
            "minimum": 0,
            "maximum": 1440,
        },

        "should_escalate": {
            "type": "boolean"
        },
    },

    "required": [
        "diagnosis",
        "action",
        "reason",
        "confidence",
        "risk_level",
        "retry_delay_minutes",
        "should_escalate",
    ],

    "additionalProperties": False,
}


# =====================================================
# SAFE FALLBACK ENGINE
# =====================================================

def fallback_decision(
    failure_reason: str,
    payment_method: str,
    retry_count: int,
) -> RecoveryDecision:

    if failure_reason in {
        "card_declined",
        "bank_declined",
        "payment_declined",
    }:

        return RecoveryDecision(
            diagnosis=(
                "The selected payment method "
                "was declined by the issuer or bank."
            ),
            action="RECOMMEND_ALTERNATE_METHOD",
            reason=(
                "Repeated attempts using the same "
                "declined payment method should be avoided. "
                "The customer should try another available method."
            ),
            confidence=0.92,
            risk_level="medium",
            retry_delay_minutes=0,
            should_escalate=False,
            decision_source="fallback",
        )


    if failure_reason == "insufficient_funds":

        return RecoveryDecision(
            diagnosis=(
                "The selected payment source "
                "may not have sufficient funds."
            ),
            action="SEND_REMINDER",
            reason=(
                "Repeated immediate attempts should "
                "be avoided when funds are insufficient."
            ),
            confidence=0.85,
            risk_level="medium",
            retry_delay_minutes=120,
            should_escalate=False,
            decision_source="fallback",
        )


    if failure_reason == "card_declined":

        return RecoveryDecision(
            diagnosis=(
                "The card transaction was declined."
            ),
            action="RECOMMEND_ALTERNATE_METHOD",
            reason=(
                "An alternate payment method "
                "is safer than repeatedly retrying "
                "a declined card."
            ),
            confidence=0.92,
            risk_level="medium",
            retry_delay_minutes=0,
            should_escalate=False,
            decision_source="fallback",
        )


    return RecoveryDecision(
        diagnosis="Unknown payment failure.",
        action="ESCALATE_TO_HUMAN",
        reason=(
            "The failure does not match "
            "an approved automatic recovery policy."
        ),
        confidence=0.50,
        risk_level="high",
        retry_delay_minutes=0,
        should_escalate=True,
        decision_source="fallback",
    )


# =====================================================
# BUILD SIMPLE PROMPT
# =====================================================

def build_prompt(
    transaction_id: str,
    amount: float,
    payment_method: str,
    failure_reason: str,
    retry_count: int,
    max_retries: int,
) -> str:

    return f"""
You are RecoverPay's payment recovery decision agent.

Analyze this failed payment.

Transaction ID: {transaction_id}
Amount INR: {amount}
Payment method: {payment_method}
Failure reason: {failure_reason}
Previous recovery attempts: {retry_count}
Maximum retries: {max_retries}

Choose exactly one approved recovery action.

Policy guidance:

- bank_unavailable:
  prefer SMART_RETRY

- network_error:
  prefer SMART_RETRY

- authentication_failed:
  prefer SEND_PAYMENT_LINK

- insufficient_funds:
  prefer SEND_REMINDER

- card_declined:
  prefer RECOMMEND_ALTERNATE_METHOD

- unknown or unsafe failure:
  ESCALATE_TO_HUMAN

Never recommend an action outside the approved list.

If maximum retries have already been reached,
recommend ESCALATE_TO_HUMAN and set should_escalate true.

Keep diagnosis and reason concise.
"""


# =====================================================
# SINGLE GROQ REQUEST
# =====================================================

def call_groq(
    client: Groq,
    prompt: str,
) -> RecoveryDecision:

    response = client.chat.completions.create(

        model=MODEL_NAME,

        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],

        temperature=0,

        response_format={
            "type": "json_schema",

            "json_schema": {
                "name": "recovery_decision",
                "strict": True,
                "schema": RECOVERY_SCHEMA,
            },
        },
    )


    content = (
        response
        .choices[0]
        .message
        .content
    )


    if not content:
        raise ValueError(
            "Groq returned empty response."
        )


    data = json.loads(content)


    decision = RecoveryDecision(
        **data
    )

    decision.decision_source = "groq"


    if (
        decision.action
        not in ALLOWED_ACTIONS
    ):
        raise ValueError(
            "Groq returned unsupported action."
        )


    return decision


# =====================================================
# MAIN RECOVERY DECISION FUNCTION
# =====================================================

def get_ai_recovery_decision(
    transaction_id: str,
    amount: float,
    payment_method: str,
    failure_reason: str,
    retry_count: int,
    max_retries: int = 3,
) -> RecoveryDecision:

    api_key = os.getenv(
        "GROQ_API_KEY"
    )


    # -----------------------------------------
    # API KEY MISSING
    # -----------------------------------------

    if not api_key:

        print(
            "WARNING: GROQ_API_KEY not found. "
            "Using fallback recovery engine."
        )

        return fallback_decision(
            failure_reason=failure_reason,
            payment_method=payment_method,
            retry_count=retry_count,
        )


    # -----------------------------------------
    # BACKEND STOPPING RULE FIRST
    # -----------------------------------------

    if retry_count >= max_retries:

        return RecoveryDecision(
            diagnosis=(
                "Maximum automatic recovery "
                "attempts have been reached."
            ),
            action="ESCALATE_TO_HUMAN",
            reason=(
                "Backend stopping rule prevents "
                "additional automatic recovery attempts."
            ),
            confidence=1.0,
            risk_level="high",
            retry_delay_minutes=0,
            should_escalate=True,
            decision_source="fallback",
        )


    client = Groq(
        api_key=api_key
    )


    prompt = build_prompt(
        transaction_id=transaction_id,
        amount=amount,
        payment_method=payment_method,
        failure_reason=failure_reason,
        retry_count=retry_count,
        max_retries=max_retries,
    )


    # -----------------------------------------
    # GROQ RETRY LOOP
    # -----------------------------------------

    max_ai_attempts = 2


    for attempt in range(
        1,
        max_ai_attempts + 1,
    ):

        try:

            print(
                "Groq API key detected - "
                f"requesting AI recovery decision "
                f"(attempt {attempt}/{max_ai_attempts})..."
            )


            decision = call_groq(
                client=client,
                prompt=prompt,
            )


            return decision


        except Exception as error:

            print(
                f"Groq attempt {attempt} failed:",
                error,
            )


            if attempt < max_ai_attempts:

                time.sleep(0.5)


    # -----------------------------------------
    # GROQ FAILED TWICE
    # -----------------------------------------

    print(
        "Groq unavailable/invalid response. "
        "Using safe fallback engine."
    )


    return fallback_decision(
        failure_reason=failure_reason,
        payment_method=payment_method,
        retry_count=retry_count,
    )