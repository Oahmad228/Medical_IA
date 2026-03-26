import React, { useState } from "react";

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
  const initialView = (() => {
    const pathname = window.location.pathname.toLowerCase();
    if (pathname.includes("/forgot-password")) return "forgot";
    if (pathname.includes("/reset-password")) return "reset";
    if (pathname.includes("/verify-email")) return "verify";
    if (pathname.includes("/signup")) return "signup";
    return "login";
  })();

  const [view, setView] = useState(initialView);
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

  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyToken, setVerifyToken] = useState(
    new URLSearchParams(window.location.search).get("token") || ""
  );
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetToken, setResetToken] = useState(
    new URLSearchParams(window.location.search).get("token") || ""
  );
  const [resetPassword, setResetPassword] = useState("");

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

    window.history.replaceState({}, "", `${targetPath}${suffix}`);
    setView(nextView);
  }

  return (
    <main className="auth-shell">
      <section className="auth-hero">
        <p className="kicker">Double Agent System</p>
        <h1>Plateforme medicale securisee</h1>
        <p>
          Connectez-vous a votre espace. Les comptes medecins sont verifies avant
          activation, et les conversations sont historisees pour le suivi clinique.
        </p>
        {info ? <p className="info-text">{info}</p> : null}
      </section>

      <section className="auth-card">
        {view === "login" ? (
          <form
            className="form-stack"
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

            <p className="auth-footnote auth-footnote--secondary">
              Email non verifie ?
              <button type="button" className="inline-link" onClick={() => goTo("verify")}>
                Verifier mon email
              </button>
            </p>
          </form>
        ) : null}

        {view === "signup" ? (
          <>
            {signupStep === "role" ? (
              <div className="form-stack">
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
                className="form-stack"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (signupRole === "PATIENT") {
                    await onSignupPatient({
                      ...patientSignup,
                      age: patientSignup.age.trim()
                        ? Number(patientSignup.age)
                        : undefined,
                    });
                  } else {
                    await onSignupDoctor({
                      ...doctorSignup,
                      yearsExperience: doctorSignup.yearsExperience.trim()
                        ? Number(doctorSignup.yearsExperience)
                        : undefined,
                    });
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
          <form
            className="form-stack"
            onSubmit={async (event) => {
              event.preventDefault();
              await onForgotPassword({ email: forgotEmail });
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
        ) : null}

        {view === "reset" ? (
          resetToken ? (
            <form
              className="form-stack"
              onSubmit={async (event) => {
                event.preventDefault();
                await onResetPassword({ token: resetToken, newPassword: resetPassword });
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
          ) : (
            <div className="form-stack">
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
          <form
            className="form-stack"
            onSubmit={async (event) => {
              event.preventDefault();
              await onConfirmVerification({ token: verifyToken });
            }}
          >
            <h2>Verification email</h2>
            <label>Token de verification</label>
            <input
              value={verifyToken}
              onChange={(e) => setVerifyToken(e.target.value)}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? "Verification..." : "Verifier mon email"}
            </button>

            <p className="muted">Vous n'avez pas recu d'email ?</p>
            <input
              type="email"
              placeholder="Votre email"
              value={verifyEmail}
              onChange={(e) => setVerifyEmail(e.target.value)}
            />
            <button
              type="button"
              className="ghost"
              disabled={loading || !verifyEmail.trim()}
              onClick={async () => onRequestVerification({ email: verifyEmail })}
            >
              Renvoyer l'email de verification
            </button>

            <p className="auth-footnote">
              Retour a la connexion
              <button type="button" className="inline-link" onClick={() => goTo("login")}>
                Cliquez ici
              </button>
            </p>
          </form>
        ) : null}

        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </main>
  );
}
