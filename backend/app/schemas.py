from typing import Literal

from pydantic import BaseModel, Field


AllowedAction = Literal[
    "SMART_RETRY",
    "SEND_PAYMENT_LINK",
    "SEND_REMINDER",
    "RECOMMEND_ALTERNATE_METHOD",
    "ESCALATE_TO_HUMAN",
    "STOP_RECOVERY",
]


class RecoveryDecision(BaseModel):
    diagnosis: str

    action: AllowedAction

    reason: str

    confidence: float = Field(
        ge=0,
        le=1,
    )

    risk_level: Literal[
        "low",
        "medium",
        "high",
    ]

    retry_delay_minutes: int = Field(
        ge=0,
        le=1440,
    )

    should_escalate: bool

    decision_source: Literal[
        "groq",
        "fallback",
    ] = "fallback"