import axios from "axios";


// =====================================================
// API CLIENT
// =====================================================

const api = axios.create({
  baseURL: "http://127.0.0.1:8000",
  headers: {
    "Content-Type": "application/json",
  },
});


// =====================================================
// HEALTH
// =====================================================

export async function getHealth() {
  const response = await api.get(
    "/health"
  );

  return response.data;
}


// =====================================================
// SIMULATED BENCHMARK METRICS
// =====================================================

export async function getMetrics() {
  const response = await api.get(
    "/metrics"
  );

  return response.data;
}


// =====================================================
// LIVE RAZORPAY TEST MODE METRICS
// =====================================================

export async function getRazorpayMetrics() {
  const response = await api.get(
    "/metrics/razorpay"
  );

  return response.data;
}


// =====================================================
// GET TRANSACTIONS
// =====================================================

export async function getTransactions(
  status = null,
  limit = 100
) {

  const params = {
    limit,
  };


  if (status) {
    params.status = status;
  }


  const response = await api.get(
    "/transactions",
    {
      params,
    }
  );


  return response.data;
}


// =====================================================
// GET SINGLE TRANSACTION
// =====================================================

export async function getTransaction(
  transactionId
) {

  const response = await api.get(
    `/transactions/${transactionId}`
  );


  return response.data;
}


// =====================================================
// GET TRANSACTION AUDIT TRAIL
// =====================================================

export async function getAuditTrail(
  transactionId
) {

  const response = await api.get(
    `/transactions/${transactionId}/audit`
  );


  return response.data;
}


// =====================================================
// GET AI DECISION
// =====================================================

export async function getAIDecision(
  transactionId
) {

  const response = await api.get(
    `/transactions/${transactionId}/ai-decision`
  );


  return response.data;
}


// =====================================================
// RECOVER SINGLE TRANSACTION
// =====================================================

export async function recoverTransaction(
  transactionId
) {

  const response = await api.post(
    `/transactions/${transactionId}/recover`
  );


  return response.data;
}


// =====================================================
// RUN BATCH RECOVERY AGENT
// =====================================================

export async function recoverAll(
  limit = 100,
  maxAttemptsPerTransaction = 3
) {

  const response = await api.post(
    "/recover-all",
    null,
    {
      params: {
        limit,
        max_attempts_per_transaction:
          maxAttemptsPerTransaction,
      },
    }
  );


  return response.data;
}


// =====================================================
// RESET DEMO
// =====================================================

export async function resetDemo() {

  const response = await api.post(
    "/demo/reset"
  );


  return response.data;
}


// =====================================================
// GENERATE NEW DEMO BATCH
// =====================================================

export async function generateDemoBatch(
  count = 100,
  seed = 42
) {

  const response = await api.post(
    "/demo/new-batch",
    null,
    {
      params: {
        count,
        seed,
      },
    }
  );


  return response.data;
}


// =====================================================
// GLOBAL AUDIT TRAIL
// =====================================================

export async function getGlobalAuditTrail(
  event = null,
  transactionId = null,
  limit = 200
) {

  const params = {
    limit,
  };


  if (event) {
    params.event = event;
  }


  if (transactionId) {
    params.transaction_id =
      transactionId;
  }


  const response = await api.get(
    "/audit",
    {
      params,
    }
  );


  return response.data;
}


// =====================================================
// CREATE REAL RAZORPAY RECOVERY LINK
// =====================================================

export async function createRazorpayRecoveryLink(
  transactionId
) {

  const response = await api.post(
    `/transactions/${transactionId}/razorpay-recovery-link`
  );


  return response.data;
}


export default api;