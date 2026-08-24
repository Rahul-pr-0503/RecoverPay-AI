import { useEffect, useState } from "react";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import TransactionsPage from "./pages/TransactionsPage";
import RecoveryAgentPage from "./pages/RecoveryAgentPage";
import AuditTrailPage from "./pages/AuditTrailPage";

import {
  AlertTriangle,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Database,
  IndianRupee,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  X,
  ExternalLink,
  Link2,
} from "lucide-react";

import {
  generateDemoBatch,
  getAuditTrail,
  getMetrics,
  getTransactions,
  recoverAll,
  createRazorpayRecoveryLink,
  getTransaction,
  getRazorpayMetrics,
  createRazorpayOrder,
  verifyRazorpayPayment,
} from "./api";

import "./App.css";


// =====================================================
// FORMAT CURRENCY
// =====================================================

function formatCurrency(value) {
  return new Intl.NumberFormat(
    "en-IN",
    {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }
  ).format(value || 0);
}


// =====================================================
// FORMAT DATABASE TEXT
// =====================================================

function formatText(value) {
  if (!value) {
    return "—";
  }

  return String(value)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(
      /\b\w/g,
      (char) => char.toUpperCase()
    );
}


// =====================================================
// MAIN APPLICATION
// =====================================================

function App() {

  // ---------------------------------------------------
  // PAGE NAVIGATION
  // ---------------------------------------------------

  const [
    activePage,
    setActivePage,
  ] = useState("dashboard");


  // ---------------------------------------------------
  // DASHBOARD STATE
  // ---------------------------------------------------

  const [
    metrics,
    setMetrics,
  ] = useState(null);
  const [
  razorpayMetrics,
  setRazorpayMetrics,
] = useState(null);

  const [
    transactions,
    setTransactions,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    checkoutLoading,
    setCheckoutLoading,
  ] = useState(false);

  const [
    checkoutMessage,
    setCheckoutMessage,
  ] = useState("");


  // ---------------------------------------------------
  // RAZORPAY RECOVERY LINK STATE
  // ---------------------------------------------------

  const [
    recoveryLinkLoading,
    setRecoveryLinkLoading,
  ] = useState(false);

  const [
    recoveryLinkResult,
    setRecoveryLinkResult,
  ] = useState(null);

  const [
    recoveryLinkError,
    setRecoveryLinkError,
  ] = useState("");


  // ---------------------------------------------------
  // DEMO BATCH STATE
  // ---------------------------------------------------

  const [
    generatingBatch,
    setGeneratingBatch,
  ] = useState(false);


  // ---------------------------------------------------
  // RECOVERY AGENT STATE
  // ---------------------------------------------------

  const [
    agentRunning,
    setAgentRunning,
  ] = useState(false);

  const [
    agentMessage,
    setAgentMessage,
  ] = useState("");


  // ---------------------------------------------------
  // TRANSACTION DRAWER STATE
  // ---------------------------------------------------

  const [
    selectedTransaction,
    setSelectedTransaction,
  ] = useState(null);

  const [
    auditTrail,
    setAuditTrail,
  ] = useState([]);

  const [
    auditLoading,
    setAuditLoading,
  ] = useState(false);


  // ===================================================
  // LOAD DASHBOARD DATA
  // ===================================================

  const refreshDashboardData = async () => {

    const [
      metricData,
      transactionData,
      razorpayMetricData,
    ] = await Promise.all([
      getMetrics(),
      getTransactions(
        null,
        200
      ),
      getRazorpayMetrics(),
    ]);

    setMetrics(
      metricData
    );

    setRazorpayMetrics(
      razorpayMetricData
    );

    setTransactions(
      transactionData
        .transactions || []
    );
  };


  useEffect(() => {
    const existingScript = document.getElementById(
      "razorpay-checkout-script"
    );

    if (existingScript) {
      return;
    }

    const script = document.createElement("script");
    script.id = "razorpay-checkout-script";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);


  const handleRazorpayCheckout = async () => {
    const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID;

    if (!keyId) {
      setCheckoutMessage(
        "Missing VITE_RAZORPAY_KEY_ID in frontend/.env."
      );
      return;
    }

    if (!window.Razorpay) {
      setCheckoutMessage(
        "Razorpay checkout script is still loading. Please try again in a moment."
      );
      return;
    }

    try {
      setCheckoutLoading(true);
      setCheckoutMessage("");

      const order = await createRazorpayOrder({
        amount: 49900,
        currency: "INR",
        receipt: "recoverpay-ai-checkout",
      });

      const razorpayOptions = {
        key: keyId,
        amount: order.amount,
        currency: order.currency,
        name: "RecoverPay AI",
        description: "Revenue Recovery Demo Payment",
        order_id: order.order_id,
        handler: async function (response) {
          try {
            await verifyRazorpayPayment({
              order_id: response.razorpay_order_id,
              payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            setCheckoutMessage(
              "Payment verified successfully."
            );
          } catch (error) {
            const detail =
              error.response?.data?.detail ||
              "Payment verification failed.";

            setCheckoutMessage(detail);
          }
        },
        prefill: {
          name: "RecoverPay Admin",
          email: "admin@recoverpay.ai",
          contact: "+919999999999",
        },
        notes: {
          receipt: order.receipt,
          source: "RecoverPay-AI",
        },
        theme: {
          color: "#7c3aed",
        },
        modal: {
          ondismiss: function () {
            setCheckoutMessage(
              "Payment was cancelled by the user."
            );
          },
        },
      };

      const razorpayInstance = new window.Razorpay(
        razorpayOptions
      );

      razorpayInstance.on("payment.failed", function (response) {
        const message =
          response.error?.description ||
          "Payment failed.";

        setCheckoutMessage(message);
      });

      razorpayInstance.open();
    } catch (error) {
      const detail =
        error.response?.data?.detail ||
        "Unable to start Razorpay checkout.";

      setCheckoutMessage(detail);
    } finally {
      setCheckoutLoading(false);
    }
  };


  const loadDashboard = async () => {

    try {

      setLoading(true);
      setError("");


      await refreshDashboardData();

    } catch (err) {

      console.error(
        "Dashboard loading error:",
        err
      );


      setError(
        "Unable to connect to RecoverPay backend."
      );

    } finally {

      setLoading(false);

    }
  };


  // ===================================================
  // REFRESH SELECTED TRANSACTION
  // ===================================================

  const refreshSelectedTransaction =
    async (
      transactionId
    ) => {

      if (!transactionId) {
        return;
      }


      try {

        const [
          updatedTransaction,
          updatedAudit,
        ] = await Promise.all([
          getTransaction(
            transactionId
          ),
          getAuditTrail(
            transactionId
          ),
        ]);


        setSelectedTransaction(
          updatedTransaction
        );


        setAuditTrail(
          updatedAudit
            .audit_trail || []
        );

      } catch (err) {

        console.error(
          "Unable to refresh selected transaction:",
          err
        );

      }
    };


  // ===================================================
  // GENERATE RAZORPAY RECOVERY LINK
  // ===================================================

  const generateRazorpayRecoveryLink =
    async () => {

      if (!selectedTransaction) {
        return;
      }


      const transactionId =
        selectedTransaction
          .transaction_id;


      if (
        !transactionId
          ?.startsWith("pay_")
      ) {

        setRecoveryLinkError(
          "Recovery links are only available for Razorpay transactions."
        );

        return;
      }


      if (
        selectedTransaction
          .status ===
        "recovered"
      ) {

        setRecoveryLinkError(
          "This transaction has already been recovered."
        );

        return;
      }


      if (
        selectedTransaction
          .status ===
        "recovery_pending"
      ) {

        setRecoveryLinkError(
          "A recovery workflow is already pending for this transaction."
        );

        return;
      }


      try {

        setRecoveryLinkLoading(
          true
        );

        setRecoveryLinkError(
          ""
        );

        setRecoveryLinkResult(
          null
        );


        const result =
          await createRazorpayRecoveryLink(
            transactionId
          );


        setRecoveryLinkResult(
          result
        );


        // Refresh transaction + audit trail
        await refreshSelectedTransaction(
          transactionId
        );


        // Refresh dashboard metrics/table without
        // replacing the drawer with the loading screen.
        await refreshDashboardData();

      } catch (error) {

        console.error(
          "Razorpay recovery link error:",
          error
        );

        const detail =
          error.response?.data?.detail ||
          "Unable to create Razorpay recovery link.";

        setRecoveryLinkError(detail);

        // Refresh transaction + audit after a bounded policy decision
        // such as ESCALATE_TO_HUMAN, without changing the error detail
        // that drives the safe-escalation UI.
        try {
          await refreshSelectedTransaction(
            transactionId
          );

          await refreshDashboardData();
        } catch (refreshError) {
          console.error(
            "Unable to refresh after recovery-link decision:",
            refreshError
          );
        }

      } finally {

        setRecoveryLinkLoading(
          false
        );

      }
    };


  // ===================================================
  // OPEN TRANSACTION DRAWER
  // ===================================================

  const openTransaction =
    async (
      transaction
    ) => {

      try {

        // Reset previous recovery-link UI
        setRecoveryLinkResult(
          null
        );

        setRecoveryLinkError(
          ""
        );

        setRecoveryLinkLoading(
          false
        );


        setSelectedTransaction(
          transaction
        );


        setAuditLoading(
          true
        );

        setAuditTrail([]);


        // Load fresh transaction state and audit in parallel
        const [
          freshTransaction,
          data,
        ] = await Promise.all([
          getTransaction(
            transaction.transaction_id
          ),
          getAuditTrail(
            transaction.transaction_id
          ),
        ]);


        setSelectedTransaction(
          freshTransaction
        );


        setAuditTrail(
          data.audit_trail || []
        );

      } catch (err) {

        console.error(
          "Unable to load transaction drawer:",
          err
        );

      } finally {

        setAuditLoading(
          false
        );

      }
    };


  // ===================================================
  // CLOSE TRANSACTION DRAWER
  // ===================================================

  const closeTransaction = () => {

    setSelectedTransaction(
      null
    );

    setAuditTrail([]);

    setRecoveryLinkResult(
      null
    );

    setRecoveryLinkError(
      ""
    );

    setRecoveryLinkLoading(
      false
    );
  };


  // ===================================================
  // CHANGE PAGE
  // ===================================================

  const changePage =
    (
      page
    ) => {

      closeTransaction();

      setActivePage(
        page
      );
    };


  // ===================================================
  // GENERATE NEW DEMO BATCH
  // ===================================================

  const generateNewBatch =
    async () => {

      try {

        setGeneratingBatch(
          true
        );


        setAgentMessage(
          "Generating a fresh simulated payment batch..."
        );


        const result =
          await generateDemoBatch(
            100,
            42
          );


        setAgentMessage(
          `Generated ${result.metrics.total_transactions} test payments. ${result.metrics.failed_transactions} payments are at risk worth ${formatCurrency(
            result.metrics.revenue_at_risk
          )}.`
        );


        closeTransaction();


        await loadDashboard();

      } catch (err) {

        console.error(
          "Demo batch generation error:",
          err
        );


        setAgentMessage(
          "Unable to generate a new demo batch."
        );

      } finally {

        setGeneratingBatch(
          false
        );

      }
    };


  // ===================================================
  // RUN AI RECOVERY AGENT
  // ===================================================

  const runRecoveryAgent =
    async () => {

      try {

        setAgentRunning(
          true
        );


        setAgentMessage(
          "AI Recovery Agent is processing at-risk payments..."
        );


        const result =
          await recoverAll();


        if (
          result.processed === 0
        ) {

          setAgentMessage(
            "No recoverable transactions are currently available."
          );

        } else {

          setAgentMessage(
            `AI processed ${result.processed} payments and recovered ${formatCurrency(
              result.batch_revenue_recovered
            )}.`
          );

        }


        await loadDashboard();

      } catch (err) {

        console.error(
          "Recovery Agent error:",
          err
        );


        setAgentMessage(
          "Recovery Agent could not complete the batch."
        );

      } finally {

        setAgentRunning(
          false
        );

      }
    };


  // ===================================================
  // INITIAL LOAD
  // ===================================================

  useEffect(() => {

    loadDashboard();

  }, []);


  // ===================================================
  // LIVE RAZORPAY RECOVERY POLLING
  // ===================================================

  useEffect(() => {

    const transactionId =
      selectedTransaction
        ?.transaction_id;


    const shouldPoll =
      transactionId
        ?.startsWith("pay_") &&
      selectedTransaction
        ?.status ===
        "recovery_pending";


    if (!shouldPoll) {
      return undefined;
    }


    let cancelled = false;


    const pollRecovery =
      async () => {

        try {

          const [
            updatedTransaction,
            updatedAudit,
            updatedRazorpayMetrics,
          ] = await Promise.all([
            getTransaction(
              transactionId
            ),
            getAuditTrail(
              transactionId
            ),
            getRazorpayMetrics(),
          ]);


          if (cancelled) {
            return;
          }


          setSelectedTransaction(
            updatedTransaction
          );


          setAuditTrail(
            updatedAudit
              .audit_trail || []
          );


          setRazorpayMetrics(
            updatedRazorpayMetrics
          );


          if (
            updatedTransaction
              .status ===
            "recovered"
          ) {

            // Hide the old link-created panel once
            // Razorpay confirms the recovery.
            setRecoveryLinkResult(
              null
            );

            setRecoveryLinkError(
              ""
            );


            // Refresh benchmark + transaction table
            // without showing the full-page loader.
            await refreshDashboardData();
          }

        } catch (err) {

          console.error(
            "Live Razorpay polling error:",
            err
          );

        }
      };


    // Check immediately, then every 3 seconds.
    pollRecovery();


    const intervalId =
      window.setInterval(
        pollRecovery,
        3000
      );


    return () => {

      cancelled = true;

      window.clearInterval(
        intervalId
      );
    };

  }, [
    selectedTransaction
      ?.transaction_id,
    selectedTransaction
      ?.status,
  ]);


  // ===================================================
  // LOADING SCREEN
  // ===================================================

  if (loading) {

    return (

      <div className="center-screen">

        <RefreshCw
          className="spin"
          size={34}
        />

        <p>
          Loading RecoverPay AI...
        </p>

      </div>

    );
  }


  // ===================================================
  // ERROR SCREEN
  // ===================================================

  if (error) {

    return (

      <div className="center-screen">

        <AlertTriangle
          size={40}
        />

        <h2>
          Backend unavailable
        </h2>

        <p>
          {error}
        </p>

        <button
          onClick={
            loadDashboard
          }
        >
          Retry
        </button>

      </div>

    );
  }


  // ===================================================
  // CALCULATED METRICS
  // ===================================================

  const outstandingRisk =
    Math.max(
      0,
      metrics.revenue_at_risk -
      metrics.revenue_recovered
    );


  const simulatedTransactions =
    transactions.filter(
      (transaction) =>
        transaction
          .transaction_id
          ?.startsWith("TXN_")
    );
  // ===================================================
// LIVE RAZORPAY RECOVERY TRANSACTIONS
// ===================================================

const razorpayRecoveryTransactions =
  transactions
    .filter(
      (transaction) =>
        transaction
          .transaction_id
          ?.startsWith("pay_") &&
        transaction.failure_reason
    )
    .sort(
      (a, b) =>
        (b.id || 0) -
        (a.id || 0)
    );


  const escalatedCount =
    simulatedTransactions.filter(
      (transaction) =>
        transaction.status ===
        "escalated"
    ).length;


  // Used by the mixed recovery table so real Razorpay
  // Test Mode failures remain visible to the operator.
  const failedTransactions =
    transactions.filter(
      (transaction) =>
        transaction.failure_reason
    );


  // Charts describe only the simulated benchmark.
  const simulatedFailedTransactions =
    simulatedTransactions.filter(
      (transaction) =>
        transaction.failure_reason
    );


  // ===================================================
  // FAILURE REASON CHART DATA
  // ===================================================

  const failureReasonMap = {};


  simulatedFailedTransactions.forEach(
    (transaction) => {

      const reason =
        formatText(
          transaction
            .failure_reason
        );


      failureReasonMap[
        reason
      ] =
        (
          failureReasonMap[
            reason
          ] || 0
        ) + 1;

    }
  );


  const failureChartData =
    Object.entries(
      failureReasonMap
    ).map(
      ([name, value]) => ({
        name,
        value,
      })
    );


  // ===================================================
  // RECOVERY ACTION CHART DATA
  // ===================================================

  const recoveryActionMap = {};


  simulatedFailedTransactions.forEach(
    (transaction) => {

      if (
        !transaction
          .recovery_action
      ) {
        return;
      }


      const action =
        formatText(
          transaction
            .recovery_action
        );


      recoveryActionMap[
        action
      ] =
        (
          recoveryActionMap[
            action
          ] || 0
        ) + 1;

    }
  );


  const actionChartData =
    Object.entries(
      recoveryActionMap
    ).map(
      ([name, value]) => ({
        name,
        value,
      })
    );


  // ===================================================
  // CHART COLORS
  // ===================================================

  const chartColors = [
    "#d5a84d",
    "#9d7c3c",
    "#7c6334",
    "#64532f",
    "#b78e45",
  ];


  // ===================================================
  // RAZORPAY TRANSACTION STATE
  // ===================================================

  const isRazorpayTransaction =
    selectedTransaction
      ?.transaction_id
      ?.startsWith(
        "pay_"
      );


  const isRecoveredRazorpayTransaction =
    isRazorpayTransaction &&
    selectedTransaction
      ?.status ===
      "recovered";


  const isRecoveryPendingRazorpayTransaction =
    isRazorpayTransaction &&
    selectedTransaction
      ?.status ===
      "recovery_pending";


  const canGenerateRazorpayRecoveryLink =
    isRazorpayTransaction &&
    [
      "at_risk",
      "escalated",
    ].includes(
      selectedTransaction
        ?.status
    );


  const isHumanEscalationDecision =
    Boolean(
      recoveryLinkError &&
      recoveryLinkError.includes(
        "ESCALATE_TO_HUMAN"
      )
    );


  // ===================================================
  // UI
  // ===================================================

  return (

    <div className="app">


      {/* =================================================
          SIDEBAR
      ================================================== */}

      <aside className="sidebar">


        {/* BRAND */}

        <div className="brand">

          <div className="brand-icon">
            R
          </div>


          <div>

            <h2>
              RecoverPay
            </h2>

            <span>
              AI Revenue Recovery
            </span>

          </div>

        </div>


        {/* NAVIGATION */}

        <nav>


          <button
            className={
              activePage ===
              "dashboard"
                ? "nav-active"
                : ""
            }
            onClick={() =>
              changePage(
                "dashboard"
              )
            }
          >
            Dashboard
          </button>


          <button
            className={
              activePage ===
              "transactions"
                ? "nav-active"
                : ""
            }
            onClick={() =>
              changePage(
                "transactions"
              )
            }
          >
            Transactions
          </button>


          <button
            className={
              activePage ===
              "agent"
                ? "nav-active"
                : ""
            }
            onClick={() =>
              changePage(
                "agent"
              )
            }
          >
            Recovery Agent
          </button>


          <button
            className={
              activePage ===
              "audit"
                ? "nav-active"
                : ""
            }
            onClick={() =>
              changePage(
                "audit"
              )
            }
          >
            Audit Trail
          </button>

        </nav>


        {/* AI STATUS */}

        <div className="sidebar-footer">

          <Bot
            size={20}
          />


          <div>

            <strong>
              AI Engine
            </strong>

            <span>
              Groq Connected
            </span>

          </div>

        </div>

      </aside>


      {/* =================================================
          MAIN CONTENT
      ================================================== */}

      <main className="main-content">


        {/* =================================================
            DASHBOARD PAGE
        ================================================== */}

        {
          activePage ===
          "dashboard" && (

            <>


              {/* =============================================
                  HEADER
              ============================================== */}

              <header>

                <div>

                  <p className="eyebrow">
                    RAZORPAY BUILDATHON • TRACK 03
                  </p>

                  <h1>
                    Revenue Recovery
                  </h1>

                  <p className="subtitle">

                    Detect revenue at risk,
                    diagnose payment failures,
                    and recover lost revenue
                    through bounded AI workflows.

                  </p>

                </div>


                {/* HEADER BUTTONS */}

                <div className="header-actions">


                  <button
                    className="demo-button"
                    onClick={
                      generateNewBatch
                    }
                    disabled={
                      generatingBatch ||
                      agentRunning
                    }
                  >

                    {
                      generatingBatch
                        ? (

                          <RefreshCw
                            className="spin"
                            size={17}
                          />

                        )
                        : (

                          <Database
                            size={17}
                          />

                        )
                    }


                    {
                      generatingBatch
                        ? "Generating..."
                        : "New Demo Batch"
                    }

                  </button>


                  <button
                    className="agent-button"
                    onClick={
                      runRecoveryAgent
                    }
                    disabled={
                      agentRunning ||
                      generatingBatch
                    }
                  >

                    {
                      agentRunning
                        ? (

                          <RefreshCw
                            className="spin"
                            size={17}
                          />

                        )
                        : (

                          <Play
                            size={17}
                          />

                        )
                    }


                    {
                      agentRunning
                        ? "Running Agent..."
                        : "Run Recovery Agent"
                    }

                  </button>


                  <button
                    className="agent-button"
                    onClick={
                      handleRazorpayCheckout
                    }
                    disabled={
                      checkoutLoading ||
                      agentRunning ||
                      generatingBatch
                    }
                  >
                    {checkoutLoading
                      ? "Opening Checkout..."
                      : "Pay with Razorpay"}
                  </button>


                  <button
                    className="refresh-button"
                    onClick={
                      loadDashboard
                    }
                    disabled={
                      agentRunning ||
                      generatingBatch
                    }
                  >

                    <RefreshCw
                      size={17}
                    />

                    Refresh

                  </button>

                </div>

              </header>


              {/* =============================================
                  AGENT MESSAGE
              ============================================== */}

              {
                agentMessage && (

                  <div className="agent-message">

                    <Bot
                      size={18}
                    />

                    <span>
                      {agentMessage}
                    </span>

                  </div>

                )
              }

              {checkoutMessage && (
                <div className="agent-message">
                  <ShieldCheck size={18} />
                  <span>{checkoutMessage}</span>
                </div>
              )}
              {/* =============================================
    LIVE RAZORPAY TEST MODE
============================================== */}

{
  razorpayMetrics && (

    <section className="razorpay-live-section">


      {/* HEADER */}

      <div className="razorpay-live-header">

        <div>

          <div className="razorpay-live-title-row">

            <span className="razorpay-live-badge">
              RAZORPAY TEST MODE
            </span>

            <span className="razorpay-live-indicator">

              <span className="live-dot" />

              LIVE

            </span>

          </div>


          <h2>
            Live Razorpay Recovery
          </h2>


          <p>
            Signed webhook events and
            recovered Test Mode revenue,
            separated from the simulated
            benchmark.
          </p>

        </div>

      </div>


      {/* METRICS */}

      <div className="razorpay-live-grid">


        <div className="razorpay-live-card">

          <span>
            Failed Payments
          </span>

          <strong>
            {
              razorpayMetrics
                .failed_transactions
            }
          </strong>

          <small>
            Entered recovery funnel
          </small>

        </div>


        <div className="razorpay-live-card">

          <span>
            Active Risk
          </span>

          <strong>
            {
              razorpayMetrics
                .active_risk_transactions
            }
          </strong>

          <small>

            {
              formatCurrency(
                razorpayMetrics
                  .outstanding_risk
              )
            }

            {" "}outstanding

          </small>

        </div>


        <div className="razorpay-live-card">

          <span>
            Recovered
          </span>

          <strong>
            {
              razorpayMetrics
                .recovered_transactions
            }
          </strong>

          <small>
            Closed by webhook
          </small>

        </div>


        <div className="razorpay-live-card razorpay-live-card-highlight">

          <span>
            Revenue Recovered
          </span>

          <strong>

            {
              formatCurrency(
                razorpayMetrics
                  .revenue_recovered
              )
            }

          </strong>

          <small>
            Razorpay Test Mode
          </small>

        </div>


        <div className="razorpay-live-card">

          <span>
            Recovery Rate
          </span>

          <strong>

            {
              razorpayMetrics
                .money_recovery_rate_percent
            }
            %

          </strong>

          <small>
            Money recovery rate
          </small>

        </div>

      </div>

    </section>

  )
}
{/* =============================================
    LIVE RAZORPAY TRANSACTION JOURNEYS
============================================== */}

{
  razorpayRecoveryTransactions.length > 0 && (

    <section className="razorpay-journey-section">

      <div className="razorpay-journey-header">

        <div>

          <span className="journey-eyebrow">
            LIVE TRANSACTION JOURNEYS
          </span>

          <h2>
            Razorpay Recovery Journeys
          </h2>

          <p>
            Follow each Test Mode payment
            from failure detection through
            AI intervention to measurable
            revenue recovery.
          </p>

        </div>

        <span className="journey-count">

          {
            razorpayRecoveryTransactions
              .length
          }

          {" "}payments

        </span>

      </div>


      <div className="razorpay-journey-list">

        {
          razorpayRecoveryTransactions
            .slice(0, 5)
            .map(
              (transaction) => {

                const recovered =
                  transaction.status ===
                  "recovered";

                const pending =
                  transaction.status ===
                  "recovery_pending";

                return (

                  <div
                    className="razorpay-journey-card"
                    key={
                      transaction
                        .transaction_id
                    }
                  >

                    {/* TRANSACTION */}

                    <div className="journey-transaction">

                      <div>

                        <span className="journey-id">
                          {
                            transaction
                              .transaction_id
                          }
                        </span>

                        <span className="journey-method">

                          {
                            formatText(
                              transaction
                                .payment_method
                            )
                          }

                        </span>

                      </div>


                      <strong>

                        {
                          formatCurrency(
                            transaction
                              .amount
                          )
                        }

                      </strong>

                    </div>


                    {/* FLOW */}

                    <div className="journey-flow">


                      {/* FAILED */}

                      <div className="journey-step journey-step-failed">

                        <AlertTriangle
                          size={15}
                        />

                        <div>

                          <span>
                            FAILED
                          </span>

                          <small>

                            {
                              formatText(
                                transaction
                                  .failure_reason
                              )
                            }

                          </small>

                        </div>

                      </div>


                      <span className="journey-arrow">
                        →
                      </span>


                      {/* AI */}

                      <div className="journey-step journey-step-ai">

                        <BrainCircuit
                          size={15}
                        />

                        <div>

                          <span>
                            AI DECISION
                          </span>

                          <small>

                            {
                              formatText(
                                transaction
                                  .recovery_action
                              )
                            }

                          </small>

                        </div>

                      </div>


                      <span className="journey-arrow">
                        →
                      </span>


                      {/* RESULT */}

                      <div
                        className={
                          `journey-step ${
                            recovered
                              ? "journey-step-success"
                              : pending
                                ? "journey-step-pending"
                                : "journey-step-risk"
                          }`
                        }
                      >

                        {
                          recovered
                            ? (
                              <CheckCircle2
                                size={15}
                              />
                            )
                            : (
                              <Clock3
                                size={15}
                              />
                            )
                        }


                        <div>

                          <span>

                            {
                              recovered
                                ? "RECOVERED"
                                : pending
                                  ? "RECOVERY PENDING"
                                  : "AT RISK"
                            }

                          </span>


                          <small>

                            {
                              recovered
                                ? `${formatCurrency(
                                    transaction
                                      .revenue_recovered
                                  )} recovered`
                                : pending
                                  ? "Waiting for payment"
                                  : "Action required"
                            }

                          </small>

                        </div>

                      </div>

                    </div>


                    {/* FOOTER */}

                    <div className="journey-footer">

                      <div>

                        <span>
                          Recovery action
                        </span>

                        <strong>

                          {
                            formatText(
                              transaction
                                .recovery_action
                            )
                          }

                        </strong>

                      </div>


                      <button
                        onClick={() =>
                          openTransaction(
                            transaction
                          )
                        }
                      >

                        View Recovery Journey

                      </button>

                    </div>

                  </div>

                );
              }
            )
        }

      </div>

    </section>

  )
}


              {/* =============================================
                  SIMULATED BENCHMARK
              ============================================== */}

              <div className="benchmark-section-label">

                <span>
                  SIMULATED BENCHMARK
                </span>

                <p>
                  100-payment batch evaluation, separated from live Razorpay Test Mode activity.
                </p>

              </div>


              {/* =============================================
                  METRIC CARDS
              ============================================== */}

              <section className="metrics-grid">


                <MetricCard
                  title="Revenue At Risk"
                  value={
                    formatCurrency(
                      metrics
                        .revenue_at_risk
                    )
                  }
                  subtitle={
                    `${metrics.failed_transactions} failed payments`
                  }
                  icon={
                    <AlertTriangle />
                  }
                />


                <MetricCard
                  title="Revenue Recovered"
                  value={
                    formatCurrency(
                      metrics
                        .revenue_recovered
                    )
                  }
                  subtitle={
                    `${metrics.recovered_transactions} transactions recovered`
                  }
                  icon={
                    <IndianRupee />
                  }
                />


                <MetricCard
                  title="Money Recovery Rate"
                  value={
                    `${metrics.money_recovery_rate_percent}%`
                  }
                  subtitle={
                    "Across simulated benchmark"
                  }
                  icon={
                    <TrendingUp />
                  }
                />


                <MetricCard
                  title="Outstanding Risk"
                  value={
                    formatCurrency(
                      outstandingRisk
                    )
                  }
                  subtitle={
                    `${escalatedCount} escalated`
                  }
                  icon={
                    <ShieldAlert />
                  }
                />

              </section>


              {/* =============================================
                  ANALYTICS
              ============================================== */}

              <section className="analytics-grid">


                {/* FAILURE ANALYSIS */}

                <div className="chart-card">

                  <div className="chart-header">

                    <div>

                      <h3>
                        Payment Failure Analysis
                      </h3>

                      <p>
                        Distribution of
                        revenue-loss causes
                      </p>

                    </div>

                  </div>


                  <div className="chart-container">

                    <ResponsiveContainer
                      width="100%"
                      height={260}
                    >

                      <BarChart
                        data={
                          failureChartData
                        }
                        margin={{
                          top: 10,
                          right: 10,
                          left: -20,
                          bottom: 15,
                        }}
                      >

                        <XAxis
                          dataKey="name"
                          tick={{
                            fontSize: 9,
                            fill:
                              "#77736c",
                          }}
                          axisLine={
                            false
                          }
                          tickLine={
                            false
                          }
                          interval={0}
                          angle={-15}
                          textAnchor="end"
                          height={60}
                        />


                        <YAxis
                          allowDecimals={
                            false
                          }
                          tick={{
                            fontSize: 9,
                            fill:
                              "#77736c",
                          }}
                          axisLine={
                            false
                          }
                          tickLine={
                            false
                          }
                        />


                        <Tooltip
                          cursor={{
                            fill:
                              "rgba(213,168,77,0.05)",
                          }}
                          contentStyle={{
                            background:
                              "#15130f",
                            border:
                              "1px solid #332d23",
                            borderRadius:
                              "8px",
                            color:
                              "#f4f1e8",
                            fontSize:
                              "11px",
                          }}
                        />


                        <Bar
                          dataKey="value"
                          fill="#d5a84d"
                          radius={[
                            5,
                            5,
                            0,
                            0,
                          ]}
                        />

                      </BarChart>

                    </ResponsiveContainer>

                  </div>

                </div>


                {/* RECOVERY STRATEGY MIX */}

                <div className="chart-card">

                  <div className="chart-header">

                    <div>

                      <h3>
                        Recovery Strategy Mix
                      </h3>

                      <p>
                        Actions selected by the
                        guarded recovery engine
                      </p>

                    </div>

                  </div>


                  <div className="chart-container">

                    {
                      actionChartData
                        .length === 0
                        ? (

                          <div className="empty-chart-state">

                            <Bot
                              size={30}
                            />

                            <p>
                              Run the Recovery Agent
                              to generate strategy
                              decisions.
                            </p>

                          </div>

                        )
                        : (

                          <ResponsiveContainer
                            width="100%"
                            height={240}
                          >

                            <PieChart>

                              <Pie
                                data={
                                  actionChartData
                                }
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={
                                  55
                                }
                                outerRadius={
                                  90
                                }
                                paddingAngle={
                                  3
                                }
                              >

                                {
                                  actionChartData.map(
                                    (
                                      item,
                                      index
                                    ) => (

                                      <Cell
                                        key={
                                          `${item.name}-${index}`
                                        }
                                        fill={
                                          chartColors[
                                            index %
                                            chartColors.length
                                          ]
                                        }
                                      />

                                    )
                                  )
                                }

                              </Pie>


                              <Tooltip
                                contentStyle={{
                                  background:
                                    "#15130f",
                                  border:
                                    "1px solid #332d23",
                                  borderRadius:
                                    "8px",
                                  color:
                                    "#f4f1e8",
                                  fontSize:
                                    "11px",
                                }}
                              />

                            </PieChart>

                          </ResponsiveContainer>

                        )
                    }

                  </div>


                  {
                    actionChartData
                      .length > 0 && (

                        <div className="chart-legend">

                          {
                            actionChartData.map(
                              (
                                item,
                                index
                              ) => (

                                <div
                                  key={
                                    item.name
                                  }
                                  className="legend-item"
                                >

                                  <div className="legend-name">

                                    <span
                                      className="legend-dot"
                                      style={{
                                        backgroundColor:
                                          chartColors[
                                            index %
                                            chartColors.length
                                          ],
                                      }}
                                    />

                                    <span>
                                      {
                                        item.name
                                      }
                                    </span>

                                  </div>


                                  <strong>
                                    {
                                      item.value
                                    }
                                  </strong>

                                </div>

                              )
                            )
                          }

                        </div>

                      )
                  }

                </div>

              </section>


              {/* =============================================
                  RECOVERY TRANSACTIONS
              ============================================== */}

              <section className="content-card">

                <div className="section-header">

                  <div>

                    <h2>
                      Recovery Transactions
                    </h2>

                    <p>
                      Latest AI-driven
                      recovery activity
                    </p>

                  </div>


                  <span className="live-badge">
                    ● LIVE
                  </span>

                </div>


                <div className="table-wrapper">

                  <table>

                    <thead>

                      <tr>

                        <th>
                          Transaction
                        </th>

                        <th>
                          Amount
                        </th>

                        <th>
                          Method
                        </th>

                        <th>
                          Failure
                        </th>

                        <th>
                          Action
                        </th>

                        <th>
                          Attempts
                        </th>

                        <th>
                          Status
                        </th>

                      </tr>

                    </thead>


                    <tbody>

                      {
                        failedTransactions
                          .slice(
                            0,
                            15
                          )
                          .map(
                            (
                              transaction
                            ) => (

                              <tr
                                key={
                                  transaction
                                    .transaction_id
                                }
                                className="clickable-row"
                                onClick={() =>
                                  openTransaction(
                                    transaction
                                  )
                                }
                              >

                                <td className="transaction-id">

                                  {
                                    transaction
                                      .transaction_id
                                  }

                                </td>


                                <td>

                                  {
                                    formatCurrency(
                                      transaction
                                        .amount
                                    )
                                  }

                                </td>


                                <td>

                                  {
                                    formatText(
                                      transaction
                                        .payment_method
                                    )
                                  }

                                </td>


                                <td>

                                  {
                                    formatText(
                                      transaction
                                        .failure_reason
                                    )
                                  }

                                </td>


                                <td>

                                  {
                                    formatText(
                                      transaction
                                        .recovery_action
                                    )
                                  }

                                </td>


                                <td>

                                  {
                                    transaction
                                      .retry_count
                                  }

                                  /

                                  {
                                    transaction
                                      .max_retries
                                  }

                                </td>


                                <td>

                                  <StatusBadge
                                    status={
                                      transaction
                                        .status
                                    }
                                  />

                                </td>

                              </tr>

                            )
                          )
                      }

                    </tbody>

                  </table>

                </div>

              </section>


              {/* =============================================
                  ARCHITECTURE NOTE
              ============================================== */}

              <div className="architecture-note">

                <Bot
                  size={21}
                />

                <div>

                  <strong>
                    Guarded Agentic Recovery
                  </strong>

                  <p>

                    Groq recommends recovery
                    actions. RecoverPay&apos;s
                    policy engine validates
                    every action before
                    execution.

                  </p>

                </div>

              </div>

            </>

          )
        }


        {/* =================================================
            TRANSACTIONS PAGE
        ================================================== */}

        {
          activePage ===
          "transactions" && (

            <TransactionsPage
              transactions={
                transactions
              }
              onOpenTransaction={
                openTransaction
              }
            />

          )
        }


        {/* =================================================
            RECOVERY AGENT PAGE
        ================================================== */}

        {
          activePage ===
          "agent" && (

            <RecoveryAgentPage
              transactions={
                transactions
              }
              metrics={
                metrics
              }
              agentRunning={
                agentRunning
              }
              agentMessage={
                agentMessage
              }
              onRunAgent={
                runRecoveryAgent
              }
            />

          )
        }


        {/* =================================================
            AUDIT TRAIL PAGE
        ================================================== */}

        {
          activePage ===
          "audit" && (

            <AuditTrailPage />

          )
        }

      </main>


      {/* =================================================
          TRANSACTION DRAWER
      ================================================== */}

      {
        selectedTransaction && (

          <div
            className="drawer-overlay"
            onClick={
              closeTransaction
            }
          >

            <div
              className="transaction-drawer"
              onClick={
                (event) =>
                  event.stopPropagation()
              }
            >


              {/* DRAWER HEADER */}

              <div className="drawer-header">

                <div>

                  <p className="drawer-label">
                    TRANSACTION DETAILS
                  </p>

                  <h2>

                    {
                      selectedTransaction
                        .transaction_id
                    }

                  </h2>

                </div>


                <button
                  className="drawer-close"
                  onClick={
                    closeTransaction
                  }
                >

                  <X
                    size={20}
                  />

                </button>

              </div>


              {/* TRANSACTION SUMMARY */}

              <div className="transaction-summary">


                <DetailItem
                  label="Amount"
                  value={
                    formatCurrency(
                      selectedTransaction
                        .amount
                    )
                  }
                />


                <DetailItem
                  label="Payment Method"
                  value={
                    formatText(
                      selectedTransaction
                        .payment_method
                    )
                  }
                />


                <DetailItem
                  label="Failure Reason"
                  value={
                    formatText(
                      selectedTransaction
                        .failure_reason
                    )
                  }
                />


                <DetailItem
                  label="Recovery Action"
                  value={
                    formatText(
                      selectedTransaction
                        .recovery_action
                    )
                  }
                />


                <DetailItem
                  label="Recovery Attempts"
                  value={
                    `${selectedTransaction.retry_count}/${selectedTransaction.max_retries}`
                  }
                />


                <DetailItem
                  label="Recovered Revenue"
                  value={
                    formatCurrency(
                      selectedTransaction
                        .revenue_recovered
                    )
                  }
                />

              </div>


              {/* FINAL STATUS */}

              <div className="drawer-status">

                <span>
                  Final Status
                </span>

                <StatusBadge
                  status={
                    selectedTransaction
                      .status
                  }
                />

              </div>


              {/* =================================================
                  REAL RAZORPAY RECOVERY
              ================================================== */}

              {
                isRazorpayTransaction && (

                  <div className="razorpay-recovery-card">


                    {/* HEADER */}

                    <div className="razorpay-recovery-header">

                      <div>

                        <span className="razorpay-badge">
                          RAZORPAY TEST MODE
                        </span>

                        <h3>
                          Revenue Recovery
                        </h3>

                      </div>


                      <span
                        className={
                          `recovery-state ${
                            isRecoveredRazorpayTransaction
                              ? "recovery-state-success"
                              : "recovery-state-risk"
                          }`
                        }
                      >

                        {
                          isRecoveredRazorpayTransaction
                            ? "Recovered"
                            : formatText(
                                selectedTransaction
                                  .status
                              )
                        }

                      </span>

                    </div>


                    {/* SUMMARY */}

                    <div className="razorpay-recovery-summary">

                      <div className="recovery-summary-item">

                        <span>
                          Original Amount
                        </span>

                        <strong>

                          {
                            formatCurrency(
                              selectedTransaction
                                .amount
                            )
                          }

                        </strong>

                      </div>


                      <div className="recovery-summary-item">

                        <span>
                          Payment Method
                        </span>

                        <strong>

                          {
                            formatText(
                              selectedTransaction
                                .payment_method
                            )
                          }

                        </strong>

                      </div>


                      <div className="recovery-summary-item">

                        <span>
                          Failure Reason
                        </span>

                        <strong>

                          {
                            formatText(
                              selectedTransaction
                                .failure_reason
                            )
                          }

                        </strong>

                      </div>


                      <div className="recovery-summary-item">

                        <span>
                          AI Action
                        </span>

                        <strong>

                          {
                            formatText(
                              selectedTransaction
                                .recovery_action
                            )
                          }

                        </strong>

                      </div>

                    </div>


                    {/* =============================================
                        RECOVERED STATE
                    ============================================== */}

                    {
                      isRecoveredRazorpayTransaction && (

                        <div className="recovery-success-box">

                          <div className="recovery-success-icon">

                            <CheckCircle2
                              size={20}
                            />

                          </div>


                          <div>

                            <span>
                              Revenue Recovered
                            </span>

                            <strong>

                              {
                                formatCurrency(
                                  selectedTransaction
                                    .revenue_recovered
                                )
                              }

                            </strong>


                            <p>

                              Razorpay confirmed the
                              recovery payment and
                              RecoverPay automatically
                              closed the revenue risk.

                            </p>

                          </div>

                        </div>

                      )
                    }


                    {/* =============================================
                        RECOVERY PENDING STATE
                    ============================================== */}

                    {
                      isRecoveryPendingRazorpayTransaction &&
                      !recoveryLinkResult && (

                        <div className="recovery-pending-box">

                          <Clock3
                            size={19}
                          />

                          <div>

                            <strong>
                              Recovery Pending
                            </strong>

                            <p>

                              A Razorpay recovery
                              workflow is active.
                              Complete the payment;
                              RecoverPay is watching
                              for signed webhook
                              confirmation.

                            </p>

                          </div>

                        </div>

                      )
                    }


                    {/* =============================================
                        GENERATE RECOVERY LINK BUTTON
                    ============================================== */}

                    {
                      canGenerateRazorpayRecoveryLink &&
                      !recoveryLinkResult &&
                      !isHumanEscalationDecision && (

                        <button
                          className="razorpay-recovery-button"
                          onClick={
                            generateRazorpayRecoveryLink
                          }
                          disabled={
                            recoveryLinkLoading
                          }
                        >

                          {
                            recoveryLinkLoading
                              ? (

                                <>

                                  <RefreshCw
                                    className="spin"
                                    size={16}
                                  />

                                  Generating Recovery Link...

                                </>

                              )
                              : (

                                <>

                                  <Link2
                                    size={16}
                                  />

                                  Generate Recovery Link

                                </>

                              )
                          }

                        </button>

                      )
                    }


                    {/* =====================================================
                        SAFE HUMAN ESCALATION
                    ====================================================== */}

                    {
                      isHumanEscalationDecision && (

                        <div className="human-escalation-card">

                          <div className="human-escalation-header">

                            <div className="human-escalation-icon">

                              <ShieldAlert
                                size={18}
                              />

                            </div>

                            <div>

                              <span className="human-escalation-eyebrow">
                                AI SAFETY DECISION
                              </span>

                              <h4>
                                Human Escalation Required
                              </h4>

                            </div>

                          </div>


                          <p>
                            RecoverPay determined that an
                            automated recovery payment link
                            should not be created for this
                            transaction.
                          </p>


                          <div className="human-escalation-flow">

                            <div>

                              <span>
                                AI Decision
                              </span>

                              <strong>
                                Escalate To Human
                              </strong>

                            </div>


                            <span className="human-escalation-arrow">
                              →
                            </span>


                            <div>

                              <span>
                                Automated Action
                              </span>

                              <strong>
                                Stopped Safely
                              </strong>

                            </div>

                          </div>


                          <div className="human-escalation-note">

                            <ShieldCheck
                              size={14}
                            />

                            <span>
                              No Razorpay recovery link was
                              generated. The bounded recovery
                              policy prevented automated
                              execution.
                            </span>

                          </div>

                        </div>

                      )
                    }


                    {/* =============================================
                        ERROR
                    ============================================== */}

                    {
                      recoveryLinkError &&
                      !isHumanEscalationDecision && (

                        <div className="recovery-error-box">

                          <AlertTriangle
                            size={16}
                          />

                          <span>
                            {
                              recoveryLinkError
                            }
                          </span>

                        </div>

                      )
                    }


                    {/* =============================================
                        RECOVERY LINK CREATED
                    ============================================== */}

                    {
                      recoveryLinkResult && (

                        <div className="recovery-link-created">


                          {/* LINK HEADER */}

                          <div className="recovery-link-title">

                            <div className="recovery-link-check">

                              <CheckCircle2
                                size={17}
                              />

                            </div>


                            <div>

                              <strong>
                                Recovery Link Created
                              </strong>

                              <span>
                                Razorpay Test Mode
                              </span>

                            </div>

                          </div>


                          {/* DETAILS */}

                          <div className="recovery-link-details">

                            <div>

                              <span>
                                Amount
                              </span>

                              <strong>

                                {
                                  formatCurrency(
                                    recoveryLinkResult
                                      .amount
                                  )
                                }

                              </strong>

                            </div>


                            <div>

                              <span>
                                AI Decision
                              </span>

                              <strong>

                                {
                                  formatText(
                                    recoveryLinkResult
                                      .ai_decision
                                      ?.action
                                  )
                                }

                              </strong>

                            </div>


                            <div>

                              <span>
                                Confidence
                              </span>

                              <strong>

                                {
                                  Math.round(
                                    (
                                      recoveryLinkResult
                                        .ai_decision
                                        ?.confidence ||
                                      0
                                    ) * 100
                                  )
                                }
                                %

                              </strong>

                            </div>

                          </div>


                          {/* URL */}

                          <div className="recovery-link-url">

                            <span>
                              Recovery URL
                            </span>

                            <code>

                              {
                                recoveryLinkResult
                                  .razorpay_recovery
                                  ?.short_url
                              }

                            </code>

                          </div>


                          {/* OPEN LINK */}

                          {
                            recoveryLinkResult
                              .razorpay_recovery
                              ?.short_url && (

                              <a
                                className="open-recovery-link"
                                href={
                                  recoveryLinkResult
                                    .razorpay_recovery
                                    .short_url
                                }
                                target="_blank"
                                rel="noreferrer"
                              >

                                <ExternalLink
                                  size={15}
                                />

                                Open Razorpay Recovery Link

                              </a>

                            )
                          }


                          <p className="recovery-link-note">

                            Complete the payment
                            in Razorpay Test Mode.
                            The signed webhook will
                            automatically update the
                            original transaction to
                            recovered.

                          </p>


                          {/* LIVE WEBHOOK WAITING */}

                          {
                            selectedTransaction
                              ?.status ===
                              "recovery_pending" && (

                              <div className="recovery-live-waiting">

                                <RefreshCw
                                  className="spin"
                                  size={14}
                                />

                                <span>
                                  Waiting for Razorpay payment confirmation...
                                </span>

                              </div>

                            )
                          }


                          {/* MANUAL REFRESH FALLBACK */}

                          <button
                            className="recovery-refresh-button"
                            onClick={
                              async () => {

                                await refreshSelectedTransaction(
                                  selectedTransaction
                                    .transaction_id
                                );

                                await refreshDashboardData();

                              }
                            }
                          >

                            <RefreshCw
                              size={14}
                            />

                            Check Recovery Status

                          </button>

                        </div>

                      )
                    }

                  </div>

                )
              }


              {/* =================================================
                  AUDIT TRAIL
              ================================================== */}

              <div className="audit-section">

                <div className="audit-title">

                  <Clock3
                    size={17}
                  />

                  <h3>
                    Recovery Audit Trail
                  </h3>

                </div>


                {
                  auditLoading
                    ? (

                      <div className="audit-loading">

                        <RefreshCw
                          className="spin"
                          size={20}
                        />

                        <span>
                          Loading audit trail...
                        </span>

                      </div>

                    )
                    : auditTrail.length ===
                      0
                      ? (

                        <div className="audit-loading">

                          <AlertTriangle
                            size={18}
                          />

                          <span>
                            No audit events found.
                          </span>

                        </div>

                      )
                      : (

                        <div className="timeline">

                          {
                            auditTrail.map(
                              (
                                log,
                                index
                              ) => (

                                <AuditEvent
                                  key={
                                    log.id ||
                                    `${log.event}-${index}`
                                  }
                                  event={
                                    log.event
                                  }
                                  message={
                                    log.message
                                  }
                                  last={
                                    index ===
                                    auditTrail.length -
                                    1
                                  }
                                />

                              )
                            )
                          }

                        </div>

                      )
                }

              </div>

            </div>

          </div>

        )
      }

    </div>
  );
}


// =====================================================
// METRIC CARD
// =====================================================

function MetricCard({
  title,
  value,
  subtitle,
  icon,
}) {

  return (

    <div className="metric-card">

      <div className="metric-top">

        <span>
          {title}
        </span>

        <div className="metric-icon">
          {icon}
        </div>

      </div>


      <h2>
        {value}
      </h2>

      <p>
        {subtitle}
      </p>

    </div>

  );
}


// =====================================================
// STATUS BADGE
// =====================================================

function StatusBadge({
  status,
}) {

  const normalized =
    status || "unknown";


  let icon = null;


  if (
    normalized ===
    "recovered"
  ) {

    icon = (

      <CheckCircle2
        size={13}
      />

    );
  }


  return (

    <span
      className={
        `status status-${normalized}`
      }
    >

      {icon}

      {
        formatText(
          normalized
        )
      }

    </span>

  );
}


// =====================================================
// DETAIL ITEM
// =====================================================

function DetailItem({
  label,
  value,
}) {

  return (

    <div className="detail-item">

      <span>
        {label}
      </span>

      <strong>
        {value || "—"}
      </strong>

    </div>

  );
}


// =====================================================
// AUDIT EVENT
// =====================================================

function AuditEvent({
  event,
  message,
  last,
}) {

  const getIcon = () => {

    if (
      event ===
      "AI_DECISION_GENERATED"
    ) {

      return (

        <BrainCircuit
          size={15}
        />

      );
    }


    if (
      event ===
      "POLICY_VALIDATED" ||
      event ===
      "POLICY_OVERRIDE"
    ) {

      return (

        <ShieldCheck
          size={15}
        />

      );
    }


    if (
      event ===
      "RECOVERY_SUCCESS" ||
      event ===
      "RAZORPAY_PAYMENT_LINK_PAID" ||
      event ===
      "RAZORPAY_RECOVERY_PAYMENT_RECEIVED"
    ) {

      return (

        <CheckCircle2
          size={15}
        />

      );
    }


    if (
      event ===
      "RECOVERY_STOPPED" ||
      event ===
      "HUMAN_ESCALATION"
    ) {

      return (

        <ShieldAlert
          size={15}
        />

      );
    }


    if (
      event ===
      "RAZORPAY_RECOVERY_LINK_CREATED"
    ) {

      return (

        <Link2
          size={15}
        />

      );
    }


    return (

      <Clock3
        size={15}
      />

    );
  };


  return (

    <div className="timeline-item">

      <div className="timeline-marker">

        <div className="timeline-icon">

          {getIcon()}

        </div>


        {
          !last && (

            <div className="timeline-line" />

          )
        }

      </div>


      <div className="timeline-content">

        <strong>

          {
            formatText(
              event
            )
          }

        </strong>

        <p>
          {message}
        </p>

      </div>

    </div>

  );
}


export default App;