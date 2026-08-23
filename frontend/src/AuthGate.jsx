import {
  useEffect,
  useState,
} from "react";

import {
  LockKeyhole,
  LogIn,
  LogOut,
  ShieldCheck,
} from "lucide-react";

import {
  loginMerchantAdmin,
} from "./api";

import {
  clearAuthSession,
  getAdminEmail,
  getAuthToken,
  setAuthSession,
} from "./auth";

import "./AuthGate.css";


export default function AuthGate({
  children,
}) {

  const [
    authenticated,
    setAuthenticated,
  ] = useState(
    Boolean(
      getAuthToken()
    )
  );


  const [
    email,
    setEmail,
  ] = useState("");


  const [
    password,
    setPassword,
  ] = useState("");


  const [
    loading,
    setLoading,
  ] = useState(false);


  const [
    error,
    setError,
  ] = useState("");


  const [
    adminEmail,
    setAdminEmail,
  ] = useState(
    getAdminEmail()
  );


  // =====================================================
  // HANDLE EXPIRED SESSION
  // =====================================================

  useEffect(() => {

    const handleExpiredSession =
      () => {

        clearAuthSession();

        setAuthenticated(
          false
        );

        setAdminEmail(
          null
        );

        setPassword("");

        setError(
          "Your merchant session expired. Please sign in again."
        );

      };


    window.addEventListener(
      "recoverpay-auth-expired",
      handleExpiredSession
    );


    return () => {

      window.removeEventListener(
        "recoverpay-auth-expired",
        handleExpiredSession
      );

    };

  }, []);


  // =====================================================
  // LOGIN
  // =====================================================

  async function handleLogin(
    event
  ) {

    event.preventDefault();

    setLoading(true);

    setError("");


    try {

      const response =
        await loginMerchantAdmin(
          email,
          password
        );


      setAuthSession(
        response.access_token,
        response.admin.email
      );


      setAdminEmail(
        response.admin.email
      );


      setAuthenticated(
        true
      );


      setPassword("");


    } catch (err) {

      const message =
        err.response?.data?.detail ||
        "Unable to sign in to RecoverPay.";


      setError(
        message
      );

    } finally {

      setLoading(
        false
      );

    }

  }


  // =====================================================
  // LOGOUT
  // =====================================================

  function handleLogout() {

    clearAuthSession();

    setAuthenticated(
      false
    );

    setAdminEmail(
      null
    );

    setEmail("");

    setPassword("");

    setError("");

  }


  // =====================================================
  // LOGIN SCREEN
  // =====================================================

  if (!authenticated) {

    return (

      <div className="merchant-login-page">

        <div className="merchant-login-glow merchant-login-glow-one" />
        <div className="merchant-login-glow merchant-login-glow-two" />


        <main className="merchant-login-card">


          <div className="merchant-login-brand">

            <div className="merchant-login-logo">
              R
            </div>


            <div>

              <strong>
                RecoverPay
              </strong>

              <span>
                AI Revenue Recovery
              </span>

            </div>

          </div>


          <div className="merchant-login-badge">

            <ShieldCheck
              size={14}
            />

            MERCHANT CONSOLE

          </div>


          <div className="merchant-login-heading">

            <h1>
              Welcome back
            </h1>

            <p>
              Sign in to access revenue
              recovery operations,
              transactions, AI decisions,
              and audit trails.
            </p>

          </div>


          <form
            className="merchant-login-form"
            onSubmit={handleLogin}
          >

            <label>

              Merchant Admin Email

              <input
                type="email"
                value={email}
                onChange={
                  (event) =>
                    setEmail(
                      event.target.value
                    )
                }
                placeholder="admin@recoverpay.ai"
                autoComplete="username"
                required
              />

            </label>


            <label>

              Password

              <div className="merchant-password-input">

                <LockKeyhole
                  size={15}
                />

                <input
                  type="password"
                  value={password}
                  onChange={
                    (event) =>
                      setPassword(
                        event.target.value
                      )
                  }
                  placeholder="Enter admin password"
                  autoComplete="current-password"
                  required
                />

              </div>

            </label>


            {
              error && (

                <div className="merchant-login-error">
                  {error}
                </div>

              )
            }


            <button
              className="merchant-login-button"
              type="submit"
              disabled={loading}
            >

              <LogIn
                size={16}
              />

              {
                loading
                  ? "Signing in..."
                  : "Sign In to RecoverPay"
              }

            </button>

          </form>


          <div className="merchant-login-security">

            <ShieldCheck
              size={14}
            />

            <span>
              Protected merchant access.
              Recovery APIs require an
              authenticated admin session.
            </span>

          </div>


        </main>

      </div>

    );

  }


  // =====================================================
  // AUTHENTICATED APPLICATION
  // =====================================================

  return (

    <>

      {children}


      <div className="merchant-session-card">

        <div className="merchant-session-icon">

          <ShieldCheck
            size={14}
          />

        </div>


        <div className="merchant-session-info">

          <span>
            Merchant Admin
          </span>

          <small>
            {
              adminEmail ||
              "Authenticated"
            }
          </small>

        </div>


        <button
          title="Logout"
          onClick={handleLogout}
        >

          <LogOut
            size={14}
          />

        </button>

      </div>

    </>

  );
}