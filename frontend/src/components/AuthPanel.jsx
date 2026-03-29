import React, { useEffect, useState } from "react";

export default function AuthPanel({
  onLogin,
  onSignupPatient,
  onSignupDoctor,
  onRequestVerification,
  onConfirmVerification,
  onForgotPassword,
  onResetPassword,
  loading,
  error,
  info,
}) {
  const getViewFromPath = (pathname) => {
    const normalized = pathname.toLowerCase();
    if (normalized.includes("/forgot-password")) return "forgot";
    if (normalized.includes("/reset-password")) return "reset";
    if (normalized.includes("/verify-email")) return "verify";
    if (normalized.includes("/signup")) return "signup";
    return "login";
  };

  const [view, setView] = useState(getViewFromPath(window.location.pathname));
  const [signupRole, setSignupRole] = useState("PATIENT");
  const [signupStep, setSignupStep] = useState("role");

  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  });

  const [patientSignup, setPatientSignup] = useState({
    fullName: "",
    email: "",
    password: "",
    age: "",
    sex: "",
    city: "",
    assistantPersona: "DOCTOR",
  });

  const [doctorSignup, setDoctorSignup] = useState({
    fullName: "",
    email: "",
    password: "",
    specialty: "",
    licenseNumber: "",
    yearsExperience: "",
    bio: "",
  });

  const [verifyToken, setVerifyToken] = useState(
    new URLSearchParams(window.location.search).get("token") || ""
  );
  const [verifyStatus, setVerifyStatus] = useState("idle");
  const [verifyMessage, setVerifyMessage] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStatus, setForgotStatus] = useState("idle");
  const [resetToken, setResetToken] = useState(
    new URLSearchParams(window.location.search).get("token") || ""
  );
  const [resetPassword, setResetPassword] = useState("");
  const [resetStatus, setResetStatus] = useState("idle");
  const [signupConfirmOpen, setSignupConfirmOpen] = useState(false);
  const [signupConfirmMessage, setSignupConfirmMessage] = useState("");
  const [verifyConfirmOpen, setVerifyConfirmOpen] = useState(false);

  useEffect(() => {
    const handlePopState = () => {
      setView(getViewFromPath(window.location.pathname));
      const token = new URLSearchParams(window.location.search).get("token") || "";
      setVerifyToken(token);
      setResetToken(token);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (view !== "verify") return;

    if (!verifyToken) {
      setVerifyStatus("error");
      setVerifyMessage("Lien de verification invalide ou manquant.");
      return;
    }

    setVerifyStatus("loading");
    setVerifyMessage("");
    onConfirmVerification({ token: verifyToken });
  }, [view, verifyToken, onConfirmVerification]);

  useEffect(() => {
    if (view !== "verify") return;
    if (!verifyToken || loading) return;

    if (error) {
      setVerifyStatus("error");
      setVerifyMessage(error);
      return;
    }

    if (info) {
      setVerifyStatus("success");
      setVerifyMessage(info);
      setVerifyConfirmOpen(true);
      return;
    }

    if (verifyStatus === "loading") {
      setVerifyStatus("success");
      setVerifyMessage("Email verifie.");
      setVerifyConfirmOpen(true);
    }
  }, [view, verifyToken, loading, error, info, verifyStatus]);

  function goTo(nextView) {
    const targetPath =
      nextView === "signup"
        ? "/signup"
        : nextView === "forgot"
        ? "/forgot-password"
        : nextView === "reset"
        ? "/reset-password"
        : nextView === "verify"
        ? "/verify-email"
        : "/login";

    const token = new URLSearchParams(window.location.search).get("token");
    const suffix =
      token && (nextView === "reset" || nextView === "verify") ? `?token=${token}` : "";

    window.history.pushState({}, "", `${targetPath}${suffix}`);
    setView(nextView);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card auth-card--center">
        <div className="auth-card__intro">
          <p className="kicker">Double Agent System</p>
          <h1>Plateforme medicale securisee</h1>
          <p className="muted">
            Acces rapide a votre espace patient, medecin ou admin.
          </p>
          {view === "login" && info ? <p className="info-text">{info}</p> : null}
        </div>

        <div className="auth-card__divider" role="presentation" />

        {view === "login" ? (
          <form
            className="form-stack auth-form"
            onSubmit={async (event) => {
              event.preventDefault();
              await onLogin(loginForm);
            }}
          >
            <h2>Connexion</h2>
            <label>Email</label>
            <input
              type="email"
              value={loginForm.email}
              onChange={(e) =>
                setLoginForm((prev) => ({ ...prev, email: e.target.value }))
              }
              required
            />
            <label>Mot de passe</label>
            <input
              type="password"
              value={loginForm.password}
              onChange={(e) =>
                setLoginForm((prev) => ({ ...prev, password: e.target.value }))
              }
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? "Connexion..." : "Se connecter"}
            </button>

            <div className="auth-links-row" role="navigation" aria-label="Autres actions de connexion">
              <button
                type="button"
                className="inline-link"
                onClick={() => {
                  setSignupStep("role");
                  goTo("signup");
                }}
              >
                Creer un compte
              </button>
              <span className="auth-links-sep" aria-hidden="true">
                ·
              </span>
              <button
                type="button"
                className="inline-link"
                onClick={() => goTo("forgot")}
              >
                Mot de passe oublie ?
              </button>
            </div>
          </form>
        ) : null}

        {view === "signup" ? (
          <>
            {signupStep === "role" ? (
              <div className="form-stack auth-form">
                <h2>Creation de compte</h2>
                <label>Je suis</label>
                <select
                  value={signupRole}
                  onChange={(e) => setSignupRole(e.target.value)}
                >
                  <option value="PATIENT">Patient</option>
                  <option value="DOCTOR">Medecin</option>
                </select>
                <button type="button" onClick={() => setSignupStep("form")}>Continuer</button>
                <p className="auth-footnote">
                  Vous avez deja un compte ?
                  <button type="button" className="inline-link" onClick={() => goTo("login")}>
                    Retour connexion
                  </button>
                </p>
              </div>
            ) : (
              <form
                className="form-stack auth-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (signupRole === "PATIENT") {
                    const response = await onSignupPatient({
                      ...patientSignup,
                      age: patientSignup.age.trim()
                        ? Number(patientSignup.age)
                        : undefined,
                    });
                    if (response?.ok) {
                      setSignupConfirmMessage(
                        "Mail envoye. Verifiez votre boite mail ou vos spams pour activer le compte."
                      );
                      setSignupConfirmOpen(true);
                    }
                  } else {
                    const response = await onSignupDoctor({
                      ...doctorSignup,
                      yearsExperience: doctorSignup.yearsExperience.trim()
                        ? Number(doctorSignup.yearsExperience)
                        : undefined,
                    });
                    if (response?.ok) {
                      setSignupConfirmMessage(
                        "Mail envoye. Verifiez votre boite mail ou vos spams. Votre compte sera ensuite valide par le superadmin."
                      );
                      setSignupConfirmOpen(true);
                    }
                  }
                }}
              >
                <h2>
                  {signupRole === "PATIENT"
                    ? "Inscription patient"
                    : "Inscription medecin"}
                </h2>

                {signupRole === "PATIENT" ? (
                  <>
                    <label>Nom complet</label>
                    <input
                      value={patientSignup.fullName}
                      onChange={(e) =>
                        setPatientSignup((prev) => ({ ...prev, fullName: e.target.value }))
                      }
                      required
                    />
                    <label>Email</label>
                    <input
                      type="email"
                      value={patientSignup.email}
                      onChange={(e) =>
                        setPatientSignup((prev) => ({ ...prev, email: e.target.value }))
                      }
                      required
                    />
                    <label>Mot de passe</label>
                    <input
                      type="password"
                      value={patientSignup.password}
                      onChange={(e) =>
                        setPatientSignup((prev) => ({ ...prev, password: e.target.value }))
                      }
                      required
                    />
                    <label>Age</label>
                    <input
                      type="number"
                      min="0"
                      max="120"
                      value={patientSignup.age}
                      onChange={(e) =>
                        setPatientSignup((prev) => ({ ...prev, age: e.target.value }))
                      }
                    />
                    <label>Sexe</label>
                    <select
                      value={patientSignup.sex}
                      onChange={(e) =>
                        setPatientSignup((prev) => ({ ...prev, sex: e.target.value }))
                      }
                    >
                      <option value="">Non specifie</option>
                      <option value="F">F</option>
                      <option value="M">M</option>
                      <option value="Autre">Autre</option>
                    </select>
                    <label>Ville</label>
                    <input
                      value={patientSignup.city}
                      onChange={(e) =>
                        setPatientSignup((prev) => ({ ...prev, city: e.target.value }))
                      }
                    />
                    <label>Assistant chibi</label>
                    <select
                      value={patientSignup.assistantPersona}
                      onChange={(e) =>
                        setPatientSignup((prev) => ({ ...prev, assistantPersona: e.target.value }))
                      }
                    >
                      <option value="DOCTOR">Docteur (humain)</option>
                      <option value="NURSE">Infirmier/Infirmiere (humain)</option>
                      <option value="OWL">Hibou (animal)</option>
                      <option value="RESCUE_DOG">Chien de secours (animal)</option>
                    </select>
                  </>
                ) : (
                  <>
                    <label>Nom complet</label>
                    <input
                      value={doctorSignup.fullName}
                      onChange={(e) =>
                        setDoctorSignup((prev) => ({ ...prev, fullName: e.target.value }))
                      }
                      required
                    />
                    <label>Email</label>
                    <input
                      type="email"
                      value={doctorSignup.email}
                      onChange={(e) =>
                        setDoctorSignup((prev) => ({ ...prev, email: e.target.value }))
                      }
                      required
                    />
                    <label>Mot de passe</label>
                    <input
                      type="password"
                      value={doctorSignup.password}
                      onChange={(e) =>
                        setDoctorSignup((prev) => ({ ...prev, password: e.target.value }))
                      }
                      required
                    />
                    <label>Specialite</label>
                    <input
                      value={doctorSignup.specialty}
                      onChange={(e) =>
                        setDoctorSignup((prev) => ({ ...prev, specialty: e.target.value }))
                      }
                      required
                    />
                    <label>Numero de licence</label>
                    <input
                      value={doctorSignup.licenseNumber}
                      onChange={(e) =>
                        setDoctorSignup((prev) => ({ ...prev, licenseNumber: e.target.value }))
                      }
                      required
                    />
                    <label>Annees d'experience</label>
                    <input
                      type="number"
                      min="0"
                      max="80"
                      value={doctorSignup.yearsExperience}
                      onChange={(e) =>
                        setDoctorSignup((prev) => ({ ...prev, yearsExperience: e.target.value }))
                      }
                    />
                    <label>Bio</label>
                    <textarea
                      rows="3"
                      value={doctorSignup.bio}
                      onChange={(e) =>
                        setDoctorSignup((prev) => ({ ...prev, bio: e.target.value }))
                      }
                    />
                  </>
                )}

                <button type="submit" disabled={loading}>
                  {loading
                    ? "Creation..."
                    : signupRole === "PATIENT"
                    ? "Creer compte patient"
                    : "Soumettre compte medecin"}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setSignupStep("role")}
                >
                  Changer de role
                </button>
              </form>
            )}
          </>
        ) : null}

        {view === "forgot" ? (
          forgotStatus === "sent" ? (
            <div className="form-stack auth-form auth-confirm">
              <h2>Lien envoye</h2>
              <p className="muted">
                Si cet email existe, un lien de reinitialisation a ete envoye.
              </p>
              <div className="auth-actions">
                <button type="button" onClick={() => goTo("login")}>
                  Retour a la connexion
                </button>
              </div>
            </div>
          ) : (
            <form
              className="form-stack auth-form"
              onSubmit={async (event) => {
                event.preventDefault();
                await onForgotPassword({ email: forgotEmail });
                setForgotStatus("sent");
              }}
            >
              <h2>Mot de passe oublie</h2>
              <label>Email</label>
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
              />
              <button type="submit" disabled={loading}>
                {loading ? "Envoi..." : "Envoyer le lien de reinitialisation"}
              </button>
              <p className="auth-footnote">
                Retour a la connexion
                <button type="button" className="inline-link" onClick={() => goTo("login")}>
                  Cliquez ici
                </button>
              </p>
            </form>
          )
        ) : null}

        {view === "reset" ? (
          resetToken ? (
            resetStatus === "done" ? (
              <div className="form-stack auth-form auth-confirm">
                <h2>Mot de passe mis a jour</h2>
                <p className="muted">Vous pouvez vous connecter avec votre nouveau mot de passe.</p>
                <div className="auth-actions">
                  <button type="button" onClick={() => goTo("login")}>
                    Retour a la connexion
                  </button>
                </div>
              </div>
            ) : (
              <form
                className="form-stack auth-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  await onResetPassword({ token: resetToken, newPassword: resetPassword });
                  setResetStatus("done");
                }}
              >
                <h2>Modifier le mot de passe</h2>
                <label>Nouveau mot de passe</label>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  required
                />
                <button type="submit" disabled={loading}>
                  {loading ? "Validation..." : "Confirmer le nouveau mot de passe"}
                </button>
              </form>
            )
          ) : (
            <div className="form-stack auth-form">
              <h2>Lien invalide ou manquant</h2>
              <p className="muted">
                Pour modifier votre mot de passe, utilisez le lien recu par email.
              </p>
              <button type="button" onClick={() => goTo("forgot")}>
                Demander un nouveau lien
              </button>
            </div>
          )
        ) : null}

        {view === "verify" ? (
          <div className="form-stack auth-form auth-verify">
            <h2>Verification email</h2>
            {verifyStatus === "loading" ? (
              <p className="muted">Verification en cours...</p>
            ) : null}

            {verifyStatus === "success" ? (
              <p className="info-text">{verifyMessage || "Email verifie."}</p>
            ) : null}

            {verifyStatus === "error" ? (
              <p className="error-text">{verifyMessage || "Verification impossible."}</p>
            ) : null}

            <div className="auth-actions">
              <button type="button" onClick={() => goTo("login")}>
                Retour a la connexion
              </button>
            </div>
          </div>
        ) : null}

        {view !== "verify" && error ? <p className="error-text">{error}</p> : null}
      </section>
      {signupConfirmOpen ? (
        <div className="auth-modal" role="dialog" aria-modal="true">
          <div className="auth-modal__card">
            <h2>Mail envoye</h2>
            <p className="muted">{signupConfirmMessage}</p>
            <div className="auth-actions">
              <button
                type="button"
                onClick={() => {
                  setSignupConfirmOpen(false);
                  setSignupStep("role");
                  goTo("login");
                }}
              >
                Retour a la connexion
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {verifyConfirmOpen ? (
        <div className="auth-modal" role="dialog" aria-modal="true">
          <div className="auth-modal__card">
            <h2>Email valide</h2>
            <p className="muted">Votre email a ete valide. Vous pouvez vous connecter.</p>
            <div className="auth-actions">
              <button
                type="button"
                onClick={() => {
                  setVerifyConfirmOpen(false);
                  goTo("login");
                }}
              >
                Retour a la connexion
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
