import React from "react";
import AuthPanel from "./components/AuthPanel";
import PageShell from "./app/PageShell";
import RoleSwitch from "./app/RoleSwitch";
import { useAuthFlow } from "./app/useAuthFlow";
import { useHealthStatus } from "./app/useHealthStatus";

export default function App() {
  const {
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
    handleSessionUpdate,
  } = useAuthFlow();
  const health = useHealthStatus();

  if (!session) {
    return (
      <PageShell>
        <AuthPanel
          onLogin={handleLogin}
          onSignupPatient={handleSignupPatient}
          onSignupDoctor={handleSignupDoctor}
          onRequestVerification={handleRequestVerification}
          onConfirmVerification={handleConfirmVerification}
          onForgotPassword={handleForgotPassword}
          onResetPassword={handleResetPassword}
          loading={authLoading}
          error={authError}
          info={authInfo}
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <RoleSwitch
        role={role}
        session={session}
        health={health}
        onLogout={handleLogout}
        onSessionUpdate={handleSessionUpdate}
      />
    </PageShell>
  );
}
