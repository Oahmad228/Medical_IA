import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { clearStoredSession, loadSession, persistSession } from "../lib/session";

/**
 * [Module: src/app/useAuthFlow.js] useAuthFlow
 * Centralizes session state and auth handlers for the App shell.
 */
export function useAuthFlow() {
  const [session, setSession] = useState(() => loadSession());
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");

  const role = useMemo(() => session?.user?.role || null, [session]);

  async function runAuthAction(action, onSuccess) {
    setAuthLoading(true);
    setAuthError("");
    setAuthInfo("");

    try {
      const result = await action();
      if (typeof onSuccess === "function") {
        onSuccess(result);
      }
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogin(form) {
    return runAuthAction(
      () => api("/auth/login", { method: "POST", payload: form }),
      (result) => {
        setSession(result);
        persistSession(result);
      }
    );
  }

  async function handleSignupPatient(form) {
    return runAuthAction(
      () => api("/auth/signup/patient", { method: "POST", payload: form }),
      (result) => {
        setAuthInfo(`Compte patient cree. ID patient: ${result.user.patientId}.`);
      }
    );
  }

  async function handleSignupDoctor(form) {
    return runAuthAction(() => api("/auth/signup/doctor", { method: "POST", payload: form }), () => {
      setAuthInfo("Compte medecin cree. Attendez la validation superadmin.");
    });
  }

  async function handleRequestVerification(form) {
    return runAuthAction(
      () => api("/auth/verify-email/request", { method: "POST", payload: form }),
      (result) => setAuthInfo(result.message)
    );
  }

  async function handleConfirmVerification(form) {
    return runAuthAction(
      () => api("/auth/verify-email/confirm", { method: "POST", payload: form }),
      (result) => setAuthInfo(result.message)
    );
  }

  async function handleForgotPassword(form) {
    return runAuthAction(
      () => api("/auth/forgot-password", { method: "POST", payload: form }),
      (result) => setAuthInfo(result.message)
    );
  }

  async function handleResetPassword(form) {
    return runAuthAction(
      () => api("/auth/reset-password", { method: "POST", payload: form }),
      (result) => setAuthInfo(result.message)
    );
  }

  async function handleLogout() {
    try {
      if (session?.token) {
        await api("/auth/logout", { method: "POST", token: session.token });
      }
    } catch (_error) {
      // Ignore logout errors and clear local session anyway.
    }

    clearStoredSession();
    setSession(null);
  }

  return {
    session,
    role,
    authLoading,
    authError,
    authInfo,
    handleLogin,
    handleSignupPatient,
    handleSignupDoctor,
    handleRequestVerification,
    handleConfirmVerification,
    handleForgotPassword,
    handleResetPassword,
    handleLogout,
  };
}
