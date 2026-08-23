from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    Integer,
    String,
    Text,
)

from backend.app.database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)

    transaction_id = Column(
        String,
        unique=True,
        index=True,
        nullable=False
    )

    amount = Column(Float, nullable=False)

    payment_method = Column(
        String,
        nullable=False
    )

    status = Column(
        String,
        nullable=False
    )

    failure_reason = Column(
        String,
        nullable=True
    )

    recovery_action = Column(
        String,
        nullable=True
    )

    retry_count = Column(
        Integer,
        default=0
    )

    max_retries = Column(
        Integer,
        default=3
    )

    recovered = Column(
        Boolean,
        default=False
    )

    revenue_recovered = Column(
        Float,
        default=0
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    transaction_id = Column(
        String,
        index=True,
        nullable=False
    )

    event = Column(
        String,
        nullable=False
    )

    message = Column(
        Text,
        nullable=False
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

class RazorpayWebhookEvent(Base):
    __tablename__ = "razorpay_webhook_events"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    event_id = Column(
        String,
        unique=True,
        index=True,
        nullable=False,
    )

    event_type = Column(
        String,
        index=True,
        nullable=False,
    )

    payment_id = Column(
        String,
        index=True,
        nullable=True,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
    )