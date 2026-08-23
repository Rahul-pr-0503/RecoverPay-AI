const TOKEN_KEY =
  "recoverpay_merchant_token";

const ADMIN_EMAIL_KEY =
  "recoverpay_merchant_email";


export function getAuthToken() {
  return sessionStorage.getItem(
    TOKEN_KEY
  );
}


export function getAdminEmail() {
  return sessionStorage.getItem(
    ADMIN_EMAIL_KEY
  );
}


export function setAuthSession(
  token,
  email
) {

  sessionStorage.setItem(
    TOKEN_KEY,
    token
  );

  sessionStorage.setItem(
    ADMIN_EMAIL_KEY,
    email
  );
}


export function clearAuthSession() {

  sessionStorage.removeItem(
    TOKEN_KEY
  );

  sessionStorage.removeItem(
    ADMIN_EMAIL_KEY
  );
}


export function isAuthenticated() {
  return Boolean(
    getAuthToken()
  );
}