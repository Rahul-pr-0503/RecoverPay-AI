import axios from "axios";

import {
  getAuthToken,
  clearAuthSession,
} from "./auth";


const api = axios.create({

  baseURL:
    "http://127.0.0.1:8000",

  headers: {
    "Content-Type":
      "application/json",
  },

});


// =========================================================
// AUTHORIZATION
// =========================================================

api.interceptors.request.use(
  (config) => {

    const token =
      getAuthToken();

    if (token) {

      config.headers.Authorization =
        `Bearer ${token}`;

    }

    return config;

  },

  (error) =>
    Promise.reject(error)
);


// =========================================================
// SESSION EXPIRY
// =========================================================

api.interceptors.response.use(

  (response) =>
    response,


  (error) => {

    const status =
      error.response?.status;


    const hasSession =
      Boolean(
        getAuthToken()
      );


    if (
      status === 401 &&
      hasSession
    ) {

      clearAuthSession();


      window.dispatchEvent(
        new Event(
          "recoverpay-auth-expired"
        )
      );

    }


    return Promise.reject(
      error
    );

  }
);


// =========================================================
// MERCHANT AUTH
// =========================================================

export async function loginMerchantAdmin(
  email,
  password
) {

  const response =
    await api.post(
      "/auth/login",
      {
        email,
        password,
      }
    );

  return response.data;
}


export async function getMerchantProfile() {

  const response =
    await api.get(
      "/auth/me"
    );

  return response.data;
}


// =========================================================
// SYSTEM
// =========================================================

export async function getHealth() {

  const response =
    await api.get(
      "/health"
    );

  return response.data;
}


// =========================================================
// METRICS
// =========================================================

export async function getMetrics() {

  const response =
    await api.get(
      "/metrics"
    );

  return response.data;
}


export async function getRazorpayMetrics() {

  const response =
    await api.get(
      "/metrics/razorpay"
    );

  return response.data;
}


// =========================================================
// TRANSACTIONS
// =========================================================

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


  const response =
    await api.get(
      "/transactions",
      {
        params,
      }
    );


  return response.data;
}


export async function getTransaction(
  transactionId
) {

  const response =
    await api.get(
      `/transactions/${transactionId}`
    );

  return response.data;
}


// =========================================================
// AUDIT
// =========================================================

export async function getAuditTrail(
  transactionId
) {

  const response =
    await api.get(
      `/transactions/${transactionId}/audit`
    );

  return response.data;
}


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


  const response =
    await api.get(
      "/audit",
      {
        params,
      }
    );


  return response.data;
}


// =========================================================
// AI
// =========================================================

export async function getAIDecision(
  transactionId
) {

  const response =
    await api.get(
      `/transactions/${transactionId}/ai-decision`
    );

  return response.data;
}


// =========================================================
// RECOVERY
// =========================================================

export async function recoverTransaction(
  transactionId
) {

  const response =
    await api.post(
      `/transactions/${transactionId}/recover`
    );

  return response.data;
}


export async function recoverAll(
  limit = 100,
  maxAttemptsPerTransaction = 3
) {

  const response =
    await api.post(
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


// =========================================================
// DEMO
// =========================================================

export async function resetDemo() {

  const response =
    await api.post(
      "/demo/reset"
    );

  return response.data;
}


export async function generateDemoBatch(
  count = 100,
  seed = 42
) {

  const response =
    await api.post(
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


// =========================================================
// RAZORPAY
// =========================================================

export async function createRazorpayRecoveryLink(
  transactionId
) {

  const response =
    await api.post(
      `/transactions/${transactionId}/razorpay-recovery-link`
    );

  return response.data;
}


export async function createRazorpayOrder({
  amount,
  currency = "INR",
  receipt = "recoverpay-ai-order",
}) {

  const response =
    await api.post(
      "/api/create-order",
      {
        amount,
        currency,
        receipt,
      }
    );

  return response.data;
}


export async function verifyRazorpayPayment({
  order_id,
  payment_id,
  razorpay_signature,
}) {

  const response =
    await api.post(
      "/api/verify-payment",
      {
        order_id,
        payment_id,
        razorpay_signature,
      }
    );

  return response.data;
}


export default api;