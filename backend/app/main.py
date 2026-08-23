import random
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Depends, FastAPI, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from backend.app.recovery_service import process_recovery
from backend.app.database import Base, engine, get_db
from backend.app.models import AuditLog, Transaction
from backend.app.recovery_engine import get_recovery_strategy
from backend.app.simulator import simulate_transactions
from backend.app.ai_agent import get_ai_recovery_decision
from backend.app.razorpay_webhook import (
    router as razorpay_router,
)
from backend.app.razorpay_service import (
    create_recovery_payment_link,
)

Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="RecoverPay AI API",
    description="Agentic Revenue Recovery and Smart Retry System",
    version="0.4.0",
)
app.include_router(
    razorpay_router
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "project": "RecoverPay AI",
        "track": "Razorpay AI Buildathon - Track 3",
        "version": "0.3.0",
        "status": "running",
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }


# ---------------------------------------------------------
# SIMULATE AND SAVE TRANSACTIONS
# ---------------------------------------------------------

@app.post("/simulate")
def simulate(
    count: int = Query(default=100, ge=1, le=1000),
    seed: int = 42,
    db: Session = Depends(get_db),
):

    result = simulate_transactions(
        count=count,
        seed=seed,
    )

    saved_count = 0

    for item in result["transactions"]:

        transaction = Transaction(
            transaction_id=item["transaction_id"],
            amount=item["amount"],
            payment_method=item["payment_method"],
            status=item["status"],
            failure_reason=item["failure_reason"],
            recovery_action=item["recovery_action"],
            retry_count=0,
            recovered=item["recovered"],
            revenue_recovered=(
                item["amount"]
                if item["recovered"]
                else 0
            ),
        )

        db.add(transaction)

        for log in item["audit_trail"]:

            audit = AuditLog(
                transaction_id=item["transaction_id"],
                event=log["event"],
                message=log["message"],
            )

            db.add(audit)

        saved_count += 1

    db.commit()

    return {
        "message": "Simulation completed and saved to database",
        "saved_transactions": saved_count,
        "metrics": result["metrics"],
        "transaction_preview": result["transactions"][:10],
    }


# ---------------------------------------------------------
# GET ALL TRANSACTIONS
# ---------------------------------------------------------

@app.get("/transactions")
def get_transactions(
    status: str | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    db: Session = Depends(get_db),
):

    query = db.query(Transaction)

    if status:
        query = query.filter(
            Transaction.status == status
        )

    transactions = (
        query
        .order_by(Transaction.id.desc())
        .limit(limit)
        .all()
    )

    return {
        "count": len(transactions),
        "transactions": transactions,
    }


# ---------------------------------------------------------
# GET SINGLE TRANSACTION
# ---------------------------------------------------------
@app.get(
    "/transactions/{transaction_id}/ai-decision"
)
def ai_recovery_decision(
    transaction_id: str,
    db: Session = Depends(get_db),
):

    transaction = (
        db.query(Transaction)
        .filter(
            Transaction.transaction_id
            == transaction_id
        )
        .first()
    )

    if not transaction:

        raise HTTPException(
            status_code=404,
            detail="Transaction not found",
        )

    if transaction.failure_reason is None:

        raise HTTPException(
            status_code=400,
            detail=(
                "Successful transaction "
                "does not require recovery"
            ),
        )

    if transaction.recovered:

        raise HTTPException(
            status_code=400,
            detail=(
                "Transaction has already "
                "been recovered"
            ),
        )

    decision = get_ai_recovery_decision(
        transaction_id=transaction.transaction_id,
        amount=transaction.amount,
        payment_method=transaction.payment_method,
        failure_reason=transaction.failure_reason,
        retry_count=transaction.retry_count,
        max_retries=transaction.max_retries,
    )

    audit = AuditLog(
        transaction_id=transaction_id,
        event="AI_DECISION_GENERATED",
        message=(
            f"AI selected {decision.action}. "
            f"Confidence: "
            f"{decision.confidence:.2f}. "
            f"Reason: {decision.reason}"
        ),
    )

    db.add(audit)
    db.commit()

    return {
        "transaction_id":
            transaction.transaction_id,

        "amount":
            transaction.amount,

        "payment_method":
            transaction.payment_method,

        "failure_reason":
            transaction.failure_reason,

        "retry_count":
            transaction.retry_count,

        "ai_decision":
            decision,
    }

@app.get("/transactions/{transaction_id}")
def get_transaction(
    transaction_id: str,
    db: Session = Depends(get_db),
):

    transaction = (
        db.query(Transaction)
        .filter(
            Transaction.transaction_id
            == transaction_id
        )
        .first()
    )

    if not transaction:

        raise HTTPException(
            status_code=404,
            detail="Transaction not found",
        )

    return transaction


# ---------------------------------------------------------
# AUDIT TRAIL
# ---------------------------------------------------------

@app.get("/transactions/{transaction_id}/audit")
def get_audit_trail(
    transaction_id: str,
    db: Session = Depends(get_db),
):

    transaction = (
        db.query(Transaction)
        .filter(
            Transaction.transaction_id
            == transaction_id
        )
        .first()
    )

    if not transaction:

        raise HTTPException(
            status_code=404,
            detail="Transaction not found",
        )

    logs = (
        db.query(AuditLog)
        .filter(
            AuditLog.transaction_id
            == transaction_id
        )
        .order_by(AuditLog.id.asc())
        .all()
    )

    return {
        "transaction_id": transaction_id,
        "audit_trail": logs,
    }


# ---------------------------------------------------------
# DASHBOARD METRICS
# ---------------------------------------------------------

# =====================================================
# SIMULATED BENCHMARK METRICS
# =====================================================

@app.get("/metrics")
def get_metrics(
    db: Session = Depends(get_db),
):

    all_transactions = (
        db.query(Transaction)
        .all()
    )


    # Only simulator-generated transactions.
    transactions = [
        transaction
        for transaction in all_transactions
        if (
            transaction.transaction_id
            and transaction.transaction_id.startswith(
                "TXN_"
            )
        )
    ]


    total_transactions = len(
        transactions
    )


    total_revenue = sum(
        float(
            transaction.amount or 0
        )
        for transaction in transactions
    )


    failed_transactions_list = [
        transaction
        for transaction in transactions
        if transaction.failure_reason
    ]


    failed_transactions = len(
        failed_transactions_list
    )


    recovered_transactions_list = [
        transaction
        for transaction in failed_transactions_list
        if (
            transaction.recovered
            or transaction.status
            == "recovered"
        )
    ]


    recovered_transactions = len(
        recovered_transactions_list
    )


    revenue_at_risk = sum(
        float(
            transaction.amount or 0
        )
        for transaction
        in failed_transactions_list
    )


    revenue_recovered = sum(
        float(
            transaction.revenue_recovered
            or 0
        )
        for transaction
        in failed_transactions_list
    )


    transaction_recovery_rate = (
        (
            recovered_transactions
            / failed_transactions
        )
        * 100
        if failed_transactions
        else 0
    )


    money_recovery_rate = (
        (
            revenue_recovered
            / revenue_at_risk
        )
        * 100
        if revenue_at_risk
        else 0
    )


    return {
        "total_transactions":
            total_transactions,

        "total_revenue":
            round(
                total_revenue,
                2,
            ),

        "failed_transactions":
            failed_transactions,

        "recovered_transactions":
            recovered_transactions,

        "revenue_at_risk":
            round(
                revenue_at_risk,
                2,
            ),

        "revenue_recovered":
            round(
                revenue_recovered,
                2,
            ),

        "transaction_recovery_rate_percent":
            round(
                transaction_recovery_rate,
                2,
            ),

        "money_recovery_rate_percent":
            round(
                money_recovery_rate,
                2,
            ),
    }

# =====================================================
# RAZORPAY TEST MODE METRICS
# =====================================================

@app.get("/metrics/razorpay")
def get_razorpay_metrics(
    db: Session = Depends(get_db),
):

    all_transactions = (
        db.query(Transaction)
        .all()
    )


    # Only Razorpay-originated transactions
    # that actually experienced a failure.
    failed_transactions_list = [
        transaction
        for transaction in all_transactions
        if (
            transaction.transaction_id
            and transaction.transaction_id.startswith(
                "pay_"
            )
            and transaction.failure_reason
        )
    ]


    failed_transactions = len(
        failed_transactions_list
    )


    active_risk_list = [
        transaction
        for transaction
        in failed_transactions_list
        if transaction.status
        in {
            "at_risk",
            "recovery_pending",
            "escalated",
        }
    ]


    active_risk_transactions = len(
        active_risk_list
    )


    recovered_transactions_list = [
        transaction
        for transaction
        in failed_transactions_list
        if (
            transaction.recovered
            or transaction.status
            == "recovered"
        )
    ]


    recovered_transactions = len(
        recovered_transactions_list
    )


    # Historical amount that entered
    # the recovery funnel.
    revenue_at_risk = sum(
        float(
            transaction.amount or 0
        )
        for transaction
        in failed_transactions_list
    )


    revenue_recovered = sum(
        float(
            transaction.revenue_recovered
            or 0
        )
        for transaction
        in failed_transactions_list
    )


    outstanding_risk = max(
        0,
        revenue_at_risk
        - revenue_recovered,
    )


    money_recovery_rate = (
        (
            revenue_recovered
            / revenue_at_risk
        )
        * 100
        if revenue_at_risk
        else 0
    )


    transaction_recovery_rate = (
        (
            recovered_transactions
            / failed_transactions
        )
        * 100
        if failed_transactions
        else 0
    )


    return {
        "mode":
            "razorpay_test_mode",

        "failed_transactions":
            failed_transactions,

        "active_risk_transactions":
            active_risk_transactions,

        "recovered_transactions":
            recovered_transactions,

        "revenue_at_risk":
            round(
                revenue_at_risk,
                2,
            ),

        "revenue_recovered":
            round(
                revenue_recovered,
                2,
            ),

        "outstanding_risk":
            round(
                outstanding_risk,
                2,
            ),

        "transaction_recovery_rate_percent":
            round(
                transaction_recovery_rate,
                2,
            ),

        "money_recovery_rate_percent":
            round(
                money_recovery_rate,
                2,
            ),
    }


# ---------------------------------------------------------
# MANUAL / AGENT RECOVERY
# ---------------------------------------------------------

@app.post(
    "/transactions/{transaction_id}/recover"
)
def recover_transaction(
    transaction_id: str,
    db: Session = Depends(get_db),
):

    transaction = (
        db.query(Transaction)
        .filter(
            Transaction.transaction_id
            == transaction_id
        )
        .first()
    )

    if not transaction:

        raise HTTPException(
            status_code=404,
            detail="Transaction not found",
        )

    try:

        result = process_recovery(
            db=db,
            transaction=transaction,
        )

        return result

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

@app.post("/recover-all")
def recover_all(
    limit: int = Query(
        default=100,
        ge=1,
        le=500,
    ),
    max_attempts_per_transaction: int = Query(
        default=3,
        ge=1,
        le=3,
    ),
    db: Session = Depends(get_db),
):

    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.failure_reason.isnot(None),
            Transaction.recovered.is_(False),
            Transaction.status.in_(
                [
                    "at_risk",
                    "recovery_pending",
                ]
            ),
        )
        .order_by(Transaction.id.asc())
        .limit(limit)
        .all()
    )

    if not transactions:

        return {
            "message":
                "No recoverable transactions found",

            "processed":
                0,
        }

    batch_revenue_at_risk = sum(
        transaction.amount
        for transaction in transactions
    )

    processed = 0
    recovered_count = 0
    escalated_count = 0
    pending_count = 0

    batch_revenue_recovered = 0

    results = []

    for transaction in transactions:

        # ---------------------------------
        # Ask AI ONCE per transaction
        # ---------------------------------

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

        latest_result = None

        # ---------------------------------
        # BOUNDED RECOVERY LOOP
        # ---------------------------------

        for attempt in range(
            max_attempts_per_transaction
        ):

            latest_result = process_recovery(
                db=db,
                transaction=transaction,
                decision=decision,

                # Only log AI decision once
                log_ai_decision=(
                    attempt == 0
                ),
            )

            db.refresh(transaction)

            if transaction.recovered:

                break

            if (
                transaction.status
                == "escalated"
            ):

                break

        processed += 1

        if transaction.recovered:

            recovered_count += 1

            batch_revenue_recovered += (
                transaction.revenue_recovered
            )

        elif (
            transaction.status
            == "escalated"
        ):

            escalated_count += 1

        else:

            pending_count += 1

        results.append(
            latest_result
        )

    recovery_rate = (
        (
            recovered_count
            / processed
        )
        * 100
        if processed
        else 0
    )

    money_recovery_rate = (
        (
            batch_revenue_recovered
            / batch_revenue_at_risk
        )
        * 100
        if batch_revenue_at_risk
        else 0
    )

    return {
        "message":
            "AI batch recovery completed",

        "processed":
            processed,

        "recovered_transactions":
            recovered_count,

        "escalated_transactions":
            escalated_count,

        "pending_transactions":
            pending_count,

        "batch_revenue_at_risk":
            round(
                batch_revenue_at_risk,
                2,
            ),

        "batch_revenue_recovered":
            round(
                batch_revenue_recovered,
                2,
            ),

        "transaction_recovery_rate_percent":
            round(
                recovery_rate,
                2,
            ),

        "money_recovery_rate_percent":
            round(
                money_recovery_rate,
                2,
            ),

        "results":
            results,
    }

@app.post("/demo/reset")
def reset_demo(
    db: Session = Depends(get_db),
):
    existing_transactions = (
    db.query(Transaction)
    .all()
)


    simulated_transaction_ids = [
        transaction.transaction_id
        for transaction
        in existing_transactions
        if (
            transaction.transaction_id
            and transaction.transaction_id.startswith(
                "TXN_"
            )
        )
    ]


    if simulated_transaction_ids:

        (
            db.query(AuditLog)
            .filter(
                AuditLog.transaction_id.in_(
                    simulated_transaction_ids
                )
            )
            .delete(
                synchronize_session=False
            )
        )


        (
            db.query(Transaction)
            .filter(
                Transaction.transaction_id.in_(
                    simulated_transaction_ids
                )
            )
            .delete(
                synchronize_session=False
            )
        )


    db.commit()

    return {
        "message": "Demo database reset successfully",
        "transactions": 0,
        "audit_logs": 0,
    }


@app.post("/demo/new-batch")
def new_demo_batch(
    count: int = Query(
        default=100,
        ge=1,
        le=1000,
    ),
    seed: int = 42,
    db: Session = Depends(get_db),
):

    # -----------------------------------
    # CLEAR PREVIOUS DEMO DATA
    # -----------------------------------

    db.query(AuditLog).delete()

    db.query(Transaction).delete()

    db.commit()


    # -----------------------------------
    # GENERATE FRESH TRANSACTIONS
    # -----------------------------------

    result = simulate_transactions(
        count=count,
        seed=seed,
    )


    saved_count = 0


    for item in result["transactions"]:

        transaction = Transaction(
            transaction_id=item[
                "transaction_id"
            ],

            amount=item["amount"],

            payment_method=item[
                "payment_method"
            ],

            status=item["status"],

            failure_reason=item[
                "failure_reason"
            ],

            recovery_action=item[
                "recovery_action"
            ],

            retry_count=0,

            recovered=item[
                "recovered"
            ],

            revenue_recovered=0,
        )


        db.add(transaction)


        for log in item[
            "audit_trail"
        ]:

            audit = AuditLog(
                transaction_id=item[
                    "transaction_id"
                ],

                event=log[
                    "event"
                ],

                message=log[
                    "message"
                ],
            )

            db.add(audit)


        saved_count += 1


    db.commit()


    return {
        "message":
            "Fresh demo batch generated",

        "saved_transactions":
            saved_count,

        "metrics":
            result["metrics"],
    }

@app.get("/audit")
def get_global_audit_trail(
    event: str | None = None,
    transaction_id: str | None = None,
    limit: int = Query(
        default=200,
        ge=1,
        le=1000,
    ),
    db: Session = Depends(get_db),
):

    query = db.query(AuditLog)

    if event:
        query = query.filter(
            AuditLog.event == event
        )

    if transaction_id:
        query = query.filter(
            AuditLog.transaction_id
            == transaction_id
        )

    logs = (
        query
        .order_by(
            AuditLog.id.desc()
        )
        .limit(limit)
        .all()
    )

    return {
        "count": len(logs),
        "audit_logs": logs,
    }

@app.post(
    "/transactions/{transaction_id}/razorpay-recovery-link"
)
def create_razorpay_recovery_link(
    transaction_id: str,
    db: Session = Depends(get_db),
):

    transaction = (
        db.query(Transaction)
        .filter(
            Transaction.transaction_id
            == transaction_id
        )
        .first()
    )


    if not transaction:

        raise HTTPException(
            status_code=404,
            detail="Transaction not found",
        )


    # Only genuine Razorpay transactions
    if not transaction.transaction_id.startswith(
        "pay_"
    ):

        raise HTTPException(
            status_code=400,
            detail=(
                "Razorpay recovery links "
                "can only be generated for "
                "Razorpay payment transactions."
            ),
        )


    if transaction.status not in {
        "at_risk",
        "recovery_pending",
        "escalated",
    }:

        raise HTTPException(
            status_code=400,
            detail=(
                "Transaction is not eligible "
                "for recovery."
            ),
        )


    # Get AI recommendation
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


    approved_actions = {
        "SEND_PAYMENT_LINK",
        "SEND_REMINDER",
        "RECOMMEND_ALTERNATE_METHOD",
        "SMART_RETRY",
    }


    if (
        decision.action
        not in approved_actions
    ):

        raise HTTPException(
            status_code=400,
            detail=(
                f"AI decision {decision.action} "
                "does not permit creation "
                "of a recovery payment link."
            ),
        )


    try:

        result = (
            create_recovery_payment_link(
                transaction_id=
                    transaction.transaction_id,

                amount_rupees=
                    transaction.amount,

                recovery_action=
                    decision.action,
            )
        )


        transaction.recovery_action = (
            decision.action
        )

        transaction.status = (
            "recovery_pending"
        )


        db.add(
            AuditLog(
                transaction_id=
                    transaction.transaction_id,

                event=
                    "AI_DECISION_GENERATED",

                message=(
                    f"AI recommended "
                    f"{decision.action}. "
                    f"Confidence="
                    f"{decision.confidence:.2f}. "
                    f"Source="
                    f"{decision.decision_source}."
                ),
            )
        )


        db.add(
            AuditLog(
                transaction_id=
                    transaction.transaction_id,

                event=
                    "POLICY_VALIDATED",

                message=(
                    f"Recovery action "
                    f"{decision.action} "
                    "approved for Razorpay "
                    "recovery."
                ),
            )
        )


        db.add(
            AuditLog(
                transaction_id=
                    transaction.transaction_id,

                event=
                    "RAZORPAY_RECOVERY_LINK_CREATED",

                message=(
                    "Created Razorpay "
                    "recovery payment link: "
                    f"{result['short_url']}"
                ),
            )
        )


        db.commit()


        return {
            "message":
                "Razorpay recovery link created",

            "transaction_id":
                transaction.transaction_id,

            "amount":
                transaction.amount,

            "failure_reason":
                transaction.failure_reason,

            "ai_decision":
                decision.model_dump(),

            "razorpay_recovery":
                result,
        }


    except Exception as error:

        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to create Razorpay "
                f"recovery link: {error}"
            ),
        )
