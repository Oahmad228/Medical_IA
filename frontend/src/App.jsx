import React, { useEffect, useMemo, useRef, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:3001";
const SESSION_KEY = "medical_ai_session_v2";

function prettyJson(data) {
  return JSON.stringify(data, null, 2);
}

function formatDateTime(value) {
  try {
    return new Date(value).toLocaleString();
  } catch (_e) {
    return String(value || "");
  }
}

function safeJsonParse(value) {
  try {
    return JSON.parse(String(value));
  } catch (_e) {
    return null;
  }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.user?.role) return null;
    return parsed;
  } catch (_error) {
    return null;
  }
}

function persistSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearStoredSession() {
  localStorage.removeItem(SESSION_KEY);
}

async function api(path, { method = "GET", payload, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Erreur API");
  }
  return data;
}

async function apiStreamChatMessage(conversationId, { payload, token, onEvent }) {
  const headers = { "Content-Type": "application/json", Accept: "text/event-stream" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(
    `${API_BASE_URL}/chat/conversations/${conversationId}/messages?stream=1`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload || {}),
    }
  );

  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Erreur API");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const raw = trimmed.slice(5).trim();
        if (!raw) continue;
        try {
          const evt = JSON.parse(raw);
          if (typeof onEvent === "function") onEvent(evt);
        } catch (_e) {
          // ignore
        }
      }
    }
  }
}

function triageMeta(level) {
  const normalized = String(level || "GREEN").toUpperCase();
  if (normalized === "RED") {
    return { icon: "!", label: "Urgence elevee", className: "risk-red" };
  }
  if (normalized === "ORANGE") {
    return { icon: "~", label: "Vigilance", className: "risk-orange" };
  }
  return { icon: "+", label: "Stable", className: "risk-green" };
}

async function filesToDataUrls(fileList, maxCount = 3) {
  const files = Array.from(fileList || []).filter((f) => String(f.type || "").startsWith("image/"));
  const picked = files.slice(0, maxCount);
  return Promise.all(
    picked.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Impossible de lire l'image."));
          reader.readAsDataURL(file);
        })
    )
  );
}

function patientAssistantMeta(persona) {
  const key = String(persona || "DOCTOR").toUpperCase();
  if (key === "NURSE") {
    return { label: "Infirmier", subject: "nurse" };
  }
  if (key === "OWL") {
    return { label: "Hibou", subject: "hibou" };
  }
  if (key === "RESCUE_DOG") {
    return { label: "Chien de secours", subject: "chien" };
  }
  // DOCTOR (patient) -> fichier image en "docter" (orthographe dans tes assets)
  return { label: "Docteur", subject: "docter" };
}

function triageToChibiImagePrefix(triage) {
  const t = String(triage || "GREEN").toUpperCase();
  // Tes assets suivent :
  //   GREEN   -> `Chibi_Calm_{subject}.png` (avec C majuscule)
  //   ORANGE  -> `chibi_jaune_{subject}.png`
  //   RED     -> `chibi_rouge_{subject}.png`
  if (t === "RED") return "chibi_rouge_";
  if (t === "ORANGE") return "chibi_jaune_";
  return "Chibi_Calm_";
}

function ChibiStage({ assistant, triageLevel, message, hasReport, onOpenReport }) {
  const sev = String(triageLevel || "GREEN").toLowerCase();
  const prefix = triageToChibiImagePrefix(triageLevel);
  const imgSrc = `/chibi/${prefix}${assistant.subject}.png`;

  return (
    <div className={`chibi-stage chibi-stage--${sev}`}>
      <div className="chibi-stage__top">
        <div>
          <p className="chibi-stage__eyebrow">Assistant</p>
          <h2 className="chibi-stage__title">{assistant.label}</h2>
        </div>
        <span className={`chibi-stage__badge chibi-stage__badge--${sev}`}>
          {String(triageLevel || "GREEN").toUpperCase()}
        </span>
      </div>

      <div className="chibi-stage__viewport" aria-hidden="true">
        <div className="chibi-stage__aurora" />
        <div className="chibi-stage__mesh" />
        <div className="chibi-stage__orbs">
          <span />
          <span />
          <span />
        </div>
        <div className="chibi-stage__horizon" />
        <div className="chibi-stage__track">
          <div className={`chibi-walker chibi-walker--${sev}`}>
            <div className="chibi-walker__glow" />
            <img
              key={imgSrc}
              className="chibi-walker__img"
              src={imgSrc}
              alt=""
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        className={`chibi-stage__bubble ${hasReport ? "chibi-stage__bubble--click" : ""}`}
        onClick={hasReport ? onOpenReport : undefined}
        disabled={!hasReport}
      >
        <span className="chibi-stage__bubble-text">{message}</span>
        {hasReport ? <span className="chibi-stage__bubble-cta">Ouvrir le rapport</span> : null}
      </button>
    </div>
  );
}

function TopBar({ title, subtitle, health, onLogout }) {
  return (
    <header className="topbar">
      <div>
        <p className="kicker">Medical AI</p>
        <h1>{title}</h1>
        <p className="topbar-subtitle">{subtitle}</p>
      </div>
      <div className="topbar-actions">
        <span className={`health-pill ${health.state}`} title="Etat du service API">
          {health.label}
        </span>
        <button
          className="ghost"
          type="button"
          onClick={onLogout}
          aria-label="Se deconnecter"
        >
          Deconnexion
        </button>
      </div>
    </header>
  );
}

function AuthPanel({
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

function ChatLayout({
  role,
  layoutVariant,
  /** patient: ID optionnel sous le composer ; doctor: ID uniquement dans le panneau droit */
  composerMetaMode = "patient",
  conversations,
  selectedConversationId,
  onSelectConversation,
  onCreateConversation,
  onDeleteConversation,
  messages,
  composer,
  setComposer,
  onSend,
  sending,
  sendError,
  rightPanel,
  stagePanel,
  imagePreviews,
  onPickImages,
  onRemoveImage,
}) {
  const fileInputRef = useRef(null);
  const isPatient = layoutVariant === "patient";
  const isDoctorMeta = composerMetaMode === "doctor";

  return (
    <section className={`chat-shell ${isPatient ? "chat-shell--patient" : "chat-shell--doctor"}`}>
      <aside className="panel history-panel glass-panel">
        <div className="panel-head">
          <h2>Conversations</h2>
          <button type="button" className="btn-pill" onClick={onCreateConversation}>
            + Nouveau
          </button>
        </div>
        <div className="history-list">
          {conversations.length === 0 ? (
            <p className="muted">Aucune conversation.</p>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={
                  conversation.id === selectedConversationId
                    ? "history-row history-row--active"
                    : "history-row"
                }
              >
                <button
                  type="button"
                  className="history-row__main"
                  onClick={() => onSelectConversation(conversation.id)}
                >
                  <strong>{conversation.title}</strong>
                  <span>{new Date(conversation.updatedAt).toLocaleString()}</span>
                </button>
                {typeof onDeleteConversation === "function" ? (
                  <button
                    type="button"
                    className="history-row__delete"
                    title="Supprimer"
                    aria-label="Supprimer la conversation"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation(conversation.id);
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6v9h2v-9h-2zm4 0v9h2v-9h-2zm-8 0v9h2v-9H6z"
                        fill="currentColor"
                        opacity="0.85"
                      />
                    </svg>
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </aside>

      <main className="panel conversation-panel glass-panel">
        <div className="panel-head panel-head--chat">
          <div>
            <p className="chat-eyebrow">Discussion</p>
            <h2>{role === "DOCTOR" ? "Assistant clinique" : "Assistant patient"}</h2>
          </div>
        </div>
        <div className="chat-stream">
          {messages.length === 0 ? (
            <p className="muted chat-empty">Écrivez un message pour lancer l’analyse.</p>
          ) : (
            messages.map((m) => (
              <article
                key={m.id}
                className={m.author === "USER" ? "bubble bubble-user" : "bubble bubble-ai"}
              >
                <p>{m.content}</p>
                <span className="bubble-time">{new Date(m.createdAt).toLocaleTimeString()}</span>
              </article>
            ))
          )}
        </div>

        <form
          className="composer composer--modern"
          onSubmit={async (event) => {
            event.preventDefault();
            await onSend();
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            accept="image/*"
            multiple
            tabIndex={-1}
            onChange={async (e) => {
              if (typeof onPickImages === "function") {
                await onPickImages(e.target.files);
                e.target.value = "";
              }
            }}
          />
          <div className="composer-surface">
            <div className="composer-input-row">
              <button
                type="button"
                className="composer-clip"
                aria-label="Joindre des images"
                title="Joindre des images (max 3)"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M17.5 12.5l-6.2 6.2a4.2 4.2 0 01-5.9-5.9l6.2-6.2a2.8 2.8 0 014 4l-6.1 6.1a1.4 1.4 0 01-2-2l5.3-5.3"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <textarea
                rows="2"
                placeholder={
                  role === "DOCTOR"
                    ? "Saisissez votre analyse ou question clinique…"
                    : "Décrivez vos symptômes, ou joignez une photo…"
                }
                value={composer.message}
                onChange={(e) =>
                  setComposer((prev) => ({ ...prev, message: e.target.value }))
                }
                required
              />
              <button type="submit" className="composer-send" disabled={sending} aria-label="Envoyer">
                {sending ? (
                  <span className="composer-send__spinner" />
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M4 12L20 4l-4 16-3-7-9-1z"
                      fill="currentColor"
                    />
                  </svg>
                )}
              </button>
            </div>
            {Array.isArray(imagePreviews) && imagePreviews.length > 0 ? (
              <div className="composer-chips">
                {imagePreviews.map((src, idx) => (
                  <div key={`${src}-${idx}`} className="composer-chip">
                    <img src={src} alt="" />
                    <button type="button" className="composer-chip-remove" onClick={() => onRemoveImage?.(idx)}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div
            className={
              isDoctorMeta ? "composer-meta composer-meta--doctor" : "composer-meta"
            }
          >
            <input
              className="composer-meta-input"
              placeholder="Localisation (optionnel)"
              value={composer.location}
              onChange={(e) =>
                setComposer((prev) => ({ ...prev, location: e.target.value }))
              }
            />
            {!isDoctorMeta ? (
              <input
                className="composer-meta-input"
                placeholder="Patient ID (optionnel)"
                value={composer.patientId}
                onChange={(e) =>
                  setComposer((prev) => ({ ...prev, patientId: e.target.value }))
                }
              />
            ) : null}
          </div>
          {isDoctorMeta ? (
            <p className="composer-meta-hint muted">
              ID patient, OTP et validation du rapport : panneau de droite.
            </p>
          ) : null}
          {sendError ? <p className="error-text composer-status">{sendError}</p> : null}
        </form>
      </main>

      {isPatient ? (
        <aside className="stage-aside glass-panel">{stagePanel}</aside>
      ) : (
        <aside className="tools-aside glass-panel">{rightPanel}</aside>
      )}
    </section>
  );
}

function PatientArea({ session, health, onLogout }) {
  const token = session.token;
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [composer, setComposer] = useState({ message: "", location: "", patientId: "", images: [] });
  const [lastTriage, setLastTriage] = useState("GREEN");
  // Patient should not see longitudinal medical reports here.
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [latestReport, setLatestReport] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [latestSymptomReport, setLatestSymptomReport] = useState(null);
  const [symptomLoading, setSymptomLoading] = useState(false);
  const [consultStatus, setConsultStatus] = useState({ status: "NONE", doctor: null });
  const [nearbyDoctors, setNearbyDoctors] = useState([]);
  const [doctorsSearchLoading, setDoctorsSearchLoading] = useState(false);
  const [doctorsSearchError, setDoctorsSearchError] = useState("");
  const [consultRequestError, setConsultRequestError] = useState("");
  const [consultRequestLoading, setConsultRequestLoading] = useState(false);

  async function refreshPatientReport() {
    try {
      const data = await api("/patient/reports/latest", { token });
      setLatestReport(data?.report || null);
    } catch (_e) {
      setLatestReport(null);
    }
  }

  async function refreshLatestSymptom() {
    try {
      setSymptomLoading(true);
      const data = await api("/patient/symptom-reports/latest", { token });
      setLatestSymptomReport(data?.report || null);
    } catch (_e) {
      setLatestSymptomReport(null);
    } finally {
      setSymptomLoading(false);
    }
  }

  async function refreshConsultStatus() {
    try {
      const data = await api("/patient/doctor-link/status", { token });
      setConsultStatus({
        status: data?.status || "NONE",
        doctor: data?.doctor || null,
      });
    } catch (_e) {
      setConsultStatus({ status: "NONE", doctor: null });
    }
  }

  async function refreshConversations(preferredId) {
    const data = await api("/chat/conversations", { token });
    setConversations(data);

    const nextId =
      preferredId ||
      (selectedConversationId && data.some((c) => c.id === selectedConversationId)
        ? selectedConversationId
        : data[0]?.id || null);

    setSelectedConversationId(nextId);
    if (nextId) {
      await loadConversation(nextId);
    } else {
      setMessages([]);
    }
  }

  async function loadConversation(id) {
    const conversation = await api(`/chat/conversations/${id}/messages`, { token });
    setMessages(conversation.messages || []);
    const latestAssistant = [...(conversation.messages || [])]
      .reverse()
      .find((m) => m.author === "ASSISTANT" && m.triageLevel);
    if (latestAssistant?.triageLevel) {
      setLastTriage(latestAssistant.triageLevel);
    }
  }

  async function createConversation() {
    const created = await api("/chat/conversations", {
      method: "POST",
      token,
      payload: { title: "Nouvelle discussion patient" },
    });
    await refreshConversations(created.id);
    return created.id;
  }

  async function deleteConversation(conversationId) {
    if (
      !window.confirm(
        "Supprimer cette conversation ? Les messages seront définitivement effacés."
      )
    ) {
      return;
    }
    try {
      await api(`/chat/conversations/${conversationId}`, { method: "DELETE", token });
      const data = await api("/chat/conversations", { token });
      setConversations(data);
      const deletedWasActive = selectedConversationId === conversationId;
      const nextId = deletedWasActive
        ? data[0]?.id ?? null
        : data.some((c) => c.id === selectedConversationId)
        ? selectedConversationId
        : data[0]?.id ?? null;
      setSelectedConversationId(nextId);
      if (nextId) {
        await loadConversation(nextId);
      } else {
        setMessages([]);
      }
      await refreshPatientReport();
      await refreshLatestSymptom();
      await refreshConsultStatus();
    } catch (e) {
      setChatError(e.message || "Impossible de supprimer.");
    }
  }

  async function sendMessage() {
    const trimmedMessage = composer.message.trim();
    if (!trimmedMessage) {
      return;
    }

    setChatSending(true);
    setChatError("");
    let conversationId = selectedConversationId;

    try {
      if (!conversationId) {
        conversationId = await createConversation();
      }

      const payload = {
        message: trimmedMessage,
        location: composer.location || undefined,
        patientId: composer.patientId.trim()
          ? Number(composer.patientId)
          : session.user.patientId,
        images: Array.isArray(composer.images) ? composer.images : [],
      };

      // Optimistic UI: show user's message + streaming assistant bubble
      const tempUserId = `tmp-user-${Date.now()}`;
      const tempAssistantId = `tmp-assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: tempUserId, author: "USER", content: trimmedMessage, createdAt: new Date().toISOString() },
        { id: tempAssistantId, author: "ASSISTANT", content: "", createdAt: new Date().toISOString() },
      ]);

      setComposer((prev) => ({ ...prev, message: "", images: [] }));

      let streamedTriage = null;
      try {
        await apiStreamChatMessage(conversationId, {
          token,
          payload,
          onEvent: (evt) => {
            if (evt?.type === "meta" && evt.triageLevel) {
              streamedTriage = evt.triageLevel;
              setLastTriage(evt.triageLevel);
            }
            if (evt?.type === "delta" && typeof evt.delta === "string") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAssistantId ? { ...m, content: `${m.content}${evt.delta}` } : m
                )
              );
            }
          },
        });
      } catch (_streamError) {
        // Fallback to non-streaming call if streaming isn't available
        const result = await api(`/chat/conversations/${conversationId}/messages`, {
          method: "POST",
          token,
          payload,
        });
        if (result.triageLevel) setLastTriage(result.triageLevel);
      }

      if (streamedTriage) setLastTriage(streamedTriage);
      await loadConversation(conversationId);
      await refreshConversations(conversationId);
      await refreshPatientReport();
      await refreshLatestSymptom();
      await refreshConsultStatus();
    } catch (error) {
      setChatError(error.message || "Erreur d'envoi du message.");
      if (conversationId) {
        try {
          await loadConversation(conversationId);
          await refreshConversations(conversationId);
        } catch (_refreshError) {
          // Ignore secondary refresh errors.
        }
      }
    } finally {
      setChatSending(false);
    }
  }

  // (hidden) Patient uses conversation history as their history.

  useEffect(() => {
    refreshConversations().catch((_error) => {
      setConversations([]);
      setMessages([]);
    });
    refreshPatientReport();
    refreshLatestSymptom().catch(() => {});
    refreshConsultStatus().catch(() => {});
    const timer = setInterval(() => {
      refreshPatientReport();
      refreshLatestSymptom().catch(() => {});
      refreshConsultStatus().catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const assistant = patientAssistantMeta(session?.user?.assistantPersona);
  const effectiveTriage = String(latestReport?.triageLevel || lastTriage).toUpperCase();
  const chibiMessage = latestReport?.patientFinalText
    ? "Mon medecin a valide un rapport. Cliquez pour le lire."
    : effectiveTriage === "RED"
    ? "Alerte: consultez en urgence maintenant."
    : effectiveTriage === "ORANGE"
    ? "Vigilance: une consultation rapide est conseillee."
    : "Tout est calme. Continuez la surveillance.";

  return (
    <>
      <TopBar
        title={`Bonjour ${session.user.fullName}`}
        subtitle="Espace Patient"
        health={health}
        onLogout={onLogout}
      />

      <ChatLayout
        role="PATIENT"
        layoutVariant="patient"
        conversations={conversations}
        selectedConversationId={selectedConversationId}
        onSelectConversation={async (id) => {
          setSelectedConversationId(id);
          try {
            await loadConversation(id);
          } catch (_e) {
            setMessages([]);
          }
        }}
        onCreateConversation={createConversation}
        onDeleteConversation={deleteConversation}
        messages={messages}
        composer={composer}
        setComposer={setComposer}
        onSend={sendMessage}
        sending={chatSending}
        sendError={chatError}
        imagePreviews={composer.images}
        onPickImages={async (files) => {
          try {
            const dataUrls = await filesToDataUrls(files, 3);
            setComposer((prev) => ({ ...prev, images: dataUrls }));
          } catch (_e) {
            setChatError("Impossible de charger l'image.");
          }
        }}
        onRemoveImage={(index) =>
          setComposer((prev) => ({
            ...prev,
            images: prev.images.filter((_item, idx) => idx !== index),
          }))
        }
        stagePanel={
          <div className="patient-stage-stack">
            <ChibiStage
              assistant={assistant}
              triageLevel={effectiveTriage}
              message={chibiMessage}
              hasReport={Boolean(latestReport?.patientFinalText)}
              onOpenReport={() => setReportOpen(true)}
            />

            {String(effectiveTriage || "").toUpperCase() === "ORANGE" ||
            String(effectiveTriage || "").toUpperCase() === "RED" ? (
              <div className="consult-card">
                <h3 className="consult-card__title">Rendez-vous (ORANGE/RED)</h3>
                <p className="consult-card__hint muted">
                  Indiquez votre localisation, puis demandez une consultation a un medecin de l&apos;app.
                </p>

                <label htmlFor="patient-location">Localisation</label>
                <input
                  id="patient-location"
                  className="consult-card__input"
                  placeholder="ex: Casablanca - Quartier Nord"
                  value={composer.location || latestSymptomReport?.location || ""}
                  onChange={(e) =>
                    setComposer((prev) => ({ ...prev, location: e.target.value }))
                  }
                />

                <div className="consult-actions">
                  <button
                    type="button"
                    className="ghost small"
                    disabled={doctorsSearchLoading}
                    onClick={async () => {
                      setDoctorsSearchError("");
                      setNearbyDoctors([]);
                      const near = String(composer.location || latestSymptomReport?.location || "").trim();
                      if (!near) {
                        setDoctorsSearchError("Localisation requise pour rechercher un medecin.");
                        return;
                      }
                      const specialist = latestSymptomReport?.specialist || "medecin generaliste";
                      try {
                        setDoctorsSearchLoading(true);
                        const data = await api(
                          `/patient/doctors/search?near=${encodeURIComponent(near)}&specialist=${encodeURIComponent(specialist)}`,
                          { token }
                        );
                        setNearbyDoctors(Array.isArray(data?.doctors) ? data.doctors : []);
                      } catch (e) {
                        setDoctorsSearchError(e.message || "Impossible de rechercher des medecins.");
                      } finally {
                        setDoctorsSearchLoading(false);
                      }
                    }}
                  >
                    {doctorsSearchLoading ? "Recherche..." : "Rechercher pres de moi"}
                  </button>

                  <button
                    type="button"
                    disabled={consultRequestLoading || consultStatus.status === "ACTIVE"}
                    onClick={async () => {
                      setConsultRequestError("");
                      try {
                        setConsultRequestLoading(true);
                        const near = String(composer.location || latestSymptomReport?.location || "").trim();
                        if (!near) {
                          setConsultRequestError("Localisation requise pour demander une consultation.");
                          return;
                        }

                        await api("/patient/consultation/request", {
                          method: "POST",
                          token,
                          payload: { location: near },
                        });
                        await refreshConsultStatus();
                      } catch (e) {
                        setConsultRequestError(e.message || "Impossible de demander la consultation.");
                      } finally {
                        setConsultRequestLoading(false);
                      }
                    }}
                  >
                    {consultRequestLoading ? "Demande..." : "Demander une consultation"}
                  </button>
                </div>

                {doctorsSearchError ? <p className="error-text">{doctorsSearchError}</p> : null}
                {consultRequestError ? <p className="error-text">{consultRequestError}</p> : null}

                {consultStatus?.status && consultStatus.status !== "NONE" ? (
                  <div className="consult-status">
                    Statut : <strong>{String(consultStatus.status).toUpperCase()}</strong>
                    {consultStatus.doctor?.fullName ? (
                      <>
                        {" "}
                        - Medecin: <strong>{consultStatus.doctor.fullName}</strong>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {Array.isArray(nearbyDoctors) && nearbyDoctors.length > 0 ? (
                  <div className="nearby-list">
                    {nearbyDoctors.slice(0, 4).map((d, idx) => (
                      <div key={`${d.name}-${idx}`} className="nearby-row">
                        <div className="nearby-row__name">{d.name}</div>
                        <div className="nearby-row__addr">{d.address}</div>
                        {typeof d.rating === "number" ? (
                          <div className="nearby-row__rating">Note: {d.rating}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        }
      />

      {reportOpen && latestReport?.patientFinalText ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setReportOpen(false)}
        >
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Rapport validé par votre médecin</h3>
              <button type="button" className="ghost modal-close" onClick={() => setReportOpen(false)}>
                Fermer
              </button>
            </div>
            <div className="modal-body">
              <div className="muted">
                Niveau de vigilance: {String(latestReport?.triageLevel || "").toUpperCase()}
              </div>
              <div className="output modal-output">{latestReport.patientFinalText}</div>
              <div className="muted">
                Si votre état s'aggrave, contactez immédiatement un service médical d'urgence.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DoctorArea({ session, health, onLogout }) {
  const token = session.token;
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [composer, setComposer] = useState({ message: "", location: "", patientId: "", images: [] });
  const [patientEmail, setPatientEmail] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [pairStatus, setPairStatus] = useState("NONE");
  const [pairError, setPairError] = useState("");
  const [pairLoading, setPairLoading] = useState(false);
  const [latestDraftReport, setLatestDraftReport] = useState(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [approveError, setApproveError] = useState("");
  const [approveLoading, setApproveLoading] = useState(false);

  const [pendingLinks, setPendingLinks] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState("");

  async function refreshPairStatus(patientId) {
    try {
      if (!patientId) return setPairStatus("NONE");
      const data = await api(`/doctor/patient-link/status?patientId=${patientId}`, { token });
      setPairStatus(data?.status || "NONE");
    } catch (_e) {
      setPairStatus("NONE");
    }
  }

  async function refreshLatestDraft(patientId) {
    try {
      setApproveError("");
      setDraftLoading(true);
      if (!patientId) {
        setLatestDraftReport(null);
        return;
      }
      const data = await api(`/doctor/reports/latest?patientId=${patientId}`, { token });
      setLatestDraftReport(data?.report || null);
    } catch (_e) {
      setLatestDraftReport(null);
    } finally {
      setDraftLoading(false);
    }
  }

  async function refreshPendingLinks() {
    try {
      setPendingLoading(true);
      setPendingError("");
      const data = await api("/doctor/patient-link/pending", { token });
      setPendingLinks(Array.isArray(data?.links) ? data.links : []);
    } catch (e) {
      setPendingError(e.message || "Erreur chargement demandes.");
      setPendingLinks([]);
    } finally {
      setPendingLoading(false);
    }
  }

  async function refreshConversations(preferredId) {
    const data = await api("/chat/conversations", { token });
    setConversations(data);

    const pid = composer.patientId?.trim() ? Number(composer.patientId) : null;
    const lockedConversation =
      pid && Number.isInteger(pid)
        ? data.find((c) => Number(c.patientId) === pid)
        : null;

    const nextId =
      preferredId ||
      (lockedConversation ? lockedConversation.id : null) ||
      null;

    setSelectedConversationId(nextId);
    if (nextId) {
      try {
        await loadConversation(nextId);
      } catch (_e) {
        setMessages([]);
      }
    } else {
      setMessages([]);
    }
  }

  async function loadConversation(id) {
    const conversation = await api(`/chat/conversations/${id}/messages`, { token });
    setMessages(conversation.messages || []);
  }

  async function createConversation(patientIdForLock) {
    const pid = patientIdForLock ? Number(patientIdForLock) : null;
    const created = await api("/chat/conversations", {
      method: "POST",
      token,
      payload: {
        title: "Nouveau dossier clinique",
        ...(pid && Number.isInteger(pid) && pid > 0 ? { patientId: pid } : {}),
      },
    });
    await refreshConversations(created.id);
    return created.id;
  }

  async function deleteConversation(conversationId) {
    if (
      !window.confirm(
        "Supprimer cette conversation ? Les messages seront définitivement effacés."
      )
    ) {
      return;
    }
    try {
      await api(`/chat/conversations/${conversationId}`, { method: "DELETE", token });
      const data = await api("/chat/conversations", { token });
      setConversations(data);
      const deletedWasActive = selectedConversationId === conversationId;
      const nextId = deletedWasActive
        ? data[0]?.id ?? null
        : data.some((c) => c.id === selectedConversationId)
        ? selectedConversationId
        : data[0]?.id ?? null;
      setSelectedConversationId(nextId);
      if (nextId) {
        await loadConversation(nextId);
      } else {
        setMessages([]);
      }
      const pid = composer.patientId.trim() ? Number(composer.patientId) : null;
      if (pid && !Number.isNaN(pid)) {
        await refreshLatestDraft(pid);
      }
    } catch (e) {
      setChatError(e.message || "Impossible de supprimer.");
    }
  }

  async function sendMessage() {
    const trimmedMessage = composer.message.trim();
    if (!trimmedMessage) {
      return;
    }

    const patientId = composer.patientId.trim() ? Number(composer.patientId) : null;
    if (!patientId || Number.isNaN(patientId)) {
      setChatError("ID patient requis (et association OTP obligatoire).");
      return;
    }

    setChatSending(true);
    setChatError("");
    let conversationId = selectedConversationId;

    try {
      const link = await api(`/doctor/patient-link/status?patientId=${patientId}`, {
        token,
      });
      if (link?.status !== "ACTIVE") {
        setChatError("Associez le patient via OTP avant d'envoyer un rapport.");
        return;
      }

      if (!conversationId) {
        conversationId = await createConversation(patientId);
      }

      const payload = {
        message: trimmedMessage,
        patientId: composer.patientId.trim() ? Number(composer.patientId) : undefined,
        images: Array.isArray(composer.images) ? composer.images : [],
      };

      const tempUserId = `tmp-user-${Date.now()}`;
      const tempAssistantId = `tmp-assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: tempUserId, author: "USER", content: trimmedMessage, createdAt: new Date().toISOString() },
        { id: tempAssistantId, author: "ASSISTANT", content: "", createdAt: new Date().toISOString() },
      ]);
      setComposer((prev) => ({ ...prev, message: "", images: [] }));

      try {
        await apiStreamChatMessage(conversationId, {
          token,
          payload,
          onEvent: (evt) => {
            if (evt?.type === "delta" && typeof evt.delta === "string") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAssistantId ? { ...m, content: `${m.content}${evt.delta}` } : m
                )
              );
            }
          },
        });
      } catch (_streamError) {
        await api(`/chat/conversations/${conversationId}/messages`, {
          method: "POST",
          token,
          payload,
        });
      }
      await loadConversation(conversationId);
      await refreshConversations(conversationId);
      await refreshLatestDraft(patientId);
    } catch (error) {
      setChatError(error.message || "Erreur d'envoi du message.");
      if (conversationId) {
        try {
          await loadConversation(conversationId);
          await refreshConversations(conversationId);
        } catch (_refreshError) {
          // Ignore secondary refresh errors.
        }
      }
    } finally {
      setChatSending(false);
    }
  }

  useEffect(() => {
    refreshConversations().catch((_error) => {
      setConversations([]);
      setMessages([]);
    });
    refreshPendingLinks().catch(() => {});
    const timer = setInterval(() => {
      refreshPendingLinks().catch(() => {});
    }, 15000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => clearInterval(timer);
  }, []);

  const selectedPending =
    pendingLinks.find(
      (l) => String(l.patientId || "").trim() === String(composer.patientId || "").trim()
    ) || null;

  useEffect(() => {
    const pid = Number(composer.patientId);
    if (composer.patientId && Number.isInteger(pid) && pid > 0) {
      refreshPairStatus(pid).catch(() => {});
      refreshLatestDraft(pid).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composer.patientId]);

  return (
    <>
      <TopBar
        title={`Bonjour Dr ${session.user.fullName}`}
        subtitle="Espace Medecin"
        health={health}
        onLogout={onLogout}
      />

      <ChatLayout
        role="DOCTOR"
        layoutVariant="doctor"
        composerMetaMode="doctor"
        conversations={conversations}
        selectedConversationId={selectedConversationId}
        onSelectConversation={async (id) => {
          setSelectedConversationId(id);
          await loadConversation(id);
        }}
        onCreateConversation={createConversation}
        onDeleteConversation={deleteConversation}
        messages={messages}
        composer={composer}
        setComposer={setComposer}
        onSend={sendMessage}
        sending={chatSending}
        sendError={chatError}
        imagePreviews={composer.images}
        onPickImages={async (files) => {
          try {
            const dataUrls = await filesToDataUrls(files, 3);
            setComposer((prev) => ({ ...prev, images: dataUrls }));
          } catch (_e) {
            setChatError("Impossible de charger l'image.");
          }
        }}
        onRemoveImage={(index) =>
          setComposer((prev) => ({
            ...prev,
            images: prev.images.filter((_item, idx) => idx !== index),
          }))
        }
        rightPanel={
          <div className="tools-stack">
            <section className="tool-section">
              <h3 className="tool-section__title">1. Patient</h3>
              <p className="tool-section__hint muted">
                Indiquez le dossier concerne avant l&apos;OTP et l&apos;analyse.
              </p>
              {pendingError ? <p className="error-text">{pendingError}</p> : null}

              {pendingLoading ? <p className="muted">Chargement des demandes...</p> : null}

              {Array.isArray(pendingLinks) && pendingLinks.length > 0 ? (
                <>
                  <label htmlFor="pending-patient-select">Demande en attente</label>
                  <select
                    id="pending-patient-select"
                    value={composer.patientId}
                    onChange={(e) =>
                      (() => {
                        const pid = e.target.value;
                        const next = pendingLinks.find(
                          (l) => String(l.patientId || "") === String(pid)
                        );
                        setPatientEmail(next?.patientEmail || "");
                        setComposer((prev) => ({ ...prev, patientId: pid }));
                      })()
                    }
                  >
                    <option value="">Selectionner...</option>
                    {pendingLinks.map((l) => (
                      <option key={l.doctorPatientLinkId} value={String(l.patientId || "")}>
                        {l.patientName} #{l.patientId} -{" "}
                        {(l.latestSymptom?.triageLevel || "").toUpperCase() || "Triage"}
                      </option>
                    ))}
                  </select>

                  {selectedPending?.latestSymptom?.location ? (
                    <p className="muted" style={{ marginTop: 0 }}>
                      Localisation patient: {selectedPending.latestSymptom.location}
                    </p>
                  ) : null}

                  {selectedPending?.latestSymptom?.specialist ? (
                    <p className="muted" style={{ marginTop: 0 }}>
                      Specialite estimee:{" "}
                      {String(selectedPending.latestSymptom.specialist || "").toLowerCase()}
                    </p>
                  ) : null}
                </>
              ) : null}

              <label htmlFor="doctor-patient-email">Email patient</label>
              <input
                id="doctor-patient-email"
                inputMode="email"
                autoComplete="off"
                placeholder="ex: nom@domaine.com"
                value={patientEmail}
                onChange={(e) => {
                  const next = e.target.value;
                  setPatientEmail(next);
                  setComposer((prev) => ({ ...prev, patientId: "" }));
                  setPairStatus("NONE");
                  setPairError("");
                  setOtpCode("");
                }}
              />
              <button
                type="button"
                className="ghost small"
                disabled={!patientEmail.trim()}
                onClick={async () => {
                  setPairError("");
                  setPairLoading(true);
                  try {
                    const email = patientEmail.trim();
                    const data = await api(
                      `/doctor/patient-link/status-by-email?patientEmail=${encodeURIComponent(email)}`,
                      { token }
                    );
                    const pid = data?.patientId;
                    if (pid) {
                      setComposer((prev) => ({ ...prev, patientId: String(pid) }));
                      setPairStatus(data?.status || "NONE");
                      await refreshLatestDraft(pid);
                    }
                  } catch (e) {
                    setPairError(e.message || "Impossible de charger le statut.");
                  } finally {
                    setPairLoading(false);
                  }
                }}
              >
                Actualiser statut et brouillon
              </button>
            </section>

            <section className="tool-section">
              <h3 className="tool-section__title">2. Liaison (OTP)</h3>
              <p className="tool-section__hint muted">
                Demandez un code au patient (email), puis confirmez-le ici pour activer l&apos;analyse.
              </p>
              <div className="pairing-box">
                <div className="muted">
                  Statut liaison : <strong>{String(pairStatus).toUpperCase()}</strong>
                </div>
                {pairError ? <p className="error-text">{pairError}</p> : null}
                <button
                  type="button"
                  disabled={pairLoading || !patientEmail.trim()}
                  onClick={async () => {
                    try {
                      setPairError("");
                      setPairLoading(true);
                      const email = patientEmail.trim();
                      const resp = await api("/doctor/patient-link/request-otp-by-email", {
                        method: "POST",
                        token,
                        payload: { patientEmail: email },
                      });

                      const pid = resp?.patientId;
                      if (pid) setComposer((prev) => ({ ...prev, patientId: String(pid) }));
                      setOtpCode("");
                      setPairStatus(resp?.status || "PENDING");
                      if (pid) {
                        await refreshPairStatus(pid);
                        await refreshLatestDraft(pid);
                      }
                    } catch (e) {
                      setPairError(e.message || "Erreur OTP.");
                    } finally {
                      setPairLoading(false);
                    }
                  }}
                >
                {pairLoading ? "Envoi OTP..." : "Demander OTP"}
                </button>
                <label htmlFor="doctor-otp">Code recu par email</label>
                <input
                  id="doctor-otp"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="ex: 123456"
                  autoComplete="one-time-code"
                />
                <button
                  type="button"
                  disabled={pairLoading || !patientEmail.trim() || !otpCode.trim()}
                  onClick={async () => {
                    try {
                      setPairError("");
                      setPairLoading(true);
                      const email = patientEmail.trim();
                      const resp = await api("/doctor/patient-link/confirm-otp-by-email", {
                        method: "POST",
                        token,
                        payload: { patientEmail: email, otp: otpCode.trim() },
                      });
                      const pid = resp?.patientId;
                      if (pid) setComposer((prev) => ({ ...prev, patientId: String(pid) }));
                      setOtpCode("");
                      if (pid) {
                        await refreshPairStatus(pid);
                        await refreshLatestDraft(pid);
                      }
                    } catch (e) {
                      setPairError(e.message || "OTP incorrect.");
                    } finally {
                      setPairLoading(false);
                    }
                  }}
                >
                  Confirmer le code
                </button>
              </div>
            </section>

            <section className="tool-section tool-section--last">
              <h3 className="tool-section__title">3. Rapport patient</h3>
              <p className="tool-section__hint muted">
                Apres echange avec l&apos;assistant, validez le texte envoye au patient.
              </p>
              {approveError ? <p className="error-text">{approveError}</p> : null}
              <div className="history-block">
                {draftLoading ? (
                  <p className="muted">Chargement du dernier brouillon...</p>
                ) : latestDraftReport ? (
                  <>
                    <div className="muted">
                      Triage :{" "}
                      <strong>{String(latestDraftReport?.triageLevel || "").toUpperCase()}</strong>
                    </div>
                    <div className="output">
                      {String(latestDraftReport?.doctorDraftText || "").slice(0, 900)}
                      {String(latestDraftReport?.doctorDraftText || "").length > 900 ? "..." : ""}
                    </div>
                    <button
                      type="button"
                      disabled={approveLoading}
                      onClick={async () => {
                        try {
                          setApproveLoading(true);
                          setApproveError("");
                          const rid = latestDraftReport.id;
                          await api(`/doctor/reports/${rid}/approve`, {
                            method: "POST",
                            token,
                            payload: {},
                          });
                          const pid = Number(composer.patientId);
                          if (!Number.isNaN(pid) && pid > 0) {
                            await refreshLatestDraft(pid);
                          }
                        } catch (e) {
                          setApproveError(e.message || "Erreur validation.");
                        } finally {
                          setApproveLoading(false);
                        }
                      }}
                    >
                      {approveLoading ? "Validation..." : "Valider et envoyer au patient"}
                    </button>
                  </>
                ) : (
                  <p className="muted">Aucun brouillon pour cet ID (ou liaison inactive).</p>
                )}
              </div>
            </section>
          </div>
        }
      />
    </>
  );
}

function SuperAdminArea({ session, health, onLogout }) {
  const token = session.token;
  const [status, setStatus] = useState("PENDING");
  const [requests, setRequests] = useState([]);
  const [message, setMessage] = useState("");

  async function loadRequests(nextStatus = status) {
    const data = await api(`/admin/doctor-requests?status=${nextStatus}`, {
      method: "GET",
      token,
    });
    setRequests(data);
  }

  async function approve(userId) {
    await api(`/admin/doctor-requests/${userId}/approve`, {
      method: "POST",
      token,
      payload: { note: "Valide par superadmin" },
    });
    setMessage("Medecin valide.");
    await loadRequests();
  }

  async function reject(userId) {
    await api(`/admin/doctor-requests/${userId}/reject`, {
      method: "POST",
      token,
      payload: { note: "Informations insuffisantes" },
    });
    setMessage("Medecin rejete.");
    await loadRequests();
  }

  useEffect(() => {
    loadRequests().catch((_error) => setRequests([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <TopBar
        title={`Bonjour ${session.user.fullName}`}
        subtitle="Espace Superadmin"
        health={health}
        onLogout={onLogout}
      />

      <main className="admin-shell">
        <section className="panel">
          <div className="panel-head">
            <h2>Validation medecins</h2>
            <select
              value={status}
              onChange={async (e) => {
                const next = e.target.value;
                setStatus(next);
                await loadRequests(next);
              }}
            >
              <option value="PENDING">Pending</option>
              <option value="ACTIVE">Active</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          {message ? <p className="info-text">{message}</p> : null}

          <div className="requests-list">
            {requests.length === 0 ? (
              <p className="muted">Aucune demande pour ce statut.</p>
            ) : (
              requests.map((request) => (
                <article key={request.id} className="request-card">
                  <div>
                    <h3>{request.fullName}</h3>
                    <p>{request.email}</p>
                    <p>Specialite: {request.doctorProfile?.specialty || "N/A"}</p>
                    <p>Licence: {request.doctorProfile?.licenseNumber || "N/A"}</p>
                    <p>Statut: {request.status}</p>
                  </div>
                  <div className="request-actions">
                    <button type="button" onClick={() => approve(request.id)}>
                      Valider
                    </button>
                    <button type="button" className="ghost" onClick={() => reject(request.id)}>
                      Rejeter
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </main>
    </>
  );
}

export default function App() {
  const [session, setSession] = useState(() => loadSession());
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");
  const [health, setHealth] = useState({ label: "Backend: verification...", state: "idle" });

  useEffect(() => {
    (async () => {
      try {
        const data = await api("/health", { method: "GET" });
        setHealth({ label: `Backend: en ligne (${data.aiMode})`, state: "ok" });
      } catch (_error) {
        setHealth({ label: "Backend: hors ligne", state: "down" });
      }
    })();
  }, []);

  async function handleLogin(form) {
    setAuthLoading(true);
    setAuthError("");
    setAuthInfo("");
    try {
      const result = await api("/auth/login", {
        method: "POST",
        payload: form,
      });
      setSession(result);
      persistSession(result);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignupPatient(form) {
    setAuthLoading(true);
    setAuthError("");
    setAuthInfo("");
    try {
      const result = await api("/auth/signup/patient", {
        method: "POST",
        payload: form,
      });
      setAuthInfo(`Compte patient cree. ID patient: ${result.user.patientId}.`);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignupDoctor(form) {
    setAuthLoading(true);
    setAuthError("");
    setAuthInfo("");
    try {
      await api("/auth/signup/doctor", {
        method: "POST",
        payload: form,
      });
      setAuthInfo("Compte medecin cree. Attendez la validation superadmin.");
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRequestVerification(form) {
    setAuthLoading(true);
    setAuthError("");
    setAuthInfo("");
    try {
      const result = await api("/auth/verify-email/request", {
        method: "POST",
        payload: form,
      });
      setAuthInfo(result.message);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleConfirmVerification(form) {
    setAuthLoading(true);
    setAuthError("");
    setAuthInfo("");
    try {
      const result = await api("/auth/verify-email/confirm", {
        method: "POST",
        payload: form,
      });
      setAuthInfo(result.message);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleForgotPassword(form) {
    setAuthLoading(true);
    setAuthError("");
    setAuthInfo("");
    try {
      const result = await api("/auth/forgot-password", {
        method: "POST",
        payload: form,
      });
      setAuthInfo(result.message);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleResetPassword(form) {
    setAuthLoading(true);
    setAuthError("");
    setAuthInfo("");
    try {
      const result = await api("/auth/reset-password", {
        method: "POST",
        payload: form,
      });
      setAuthInfo(result.message);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
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

  const role = useMemo(() => session?.user?.role || null, [session]);

  if (!session) {
    return (
      <div className="page-shell">
        <div className="bg-blob bg-blob-a" />
        <div className="bg-blob bg-blob-b" />
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
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="bg-blob bg-blob-a" />
      <div className="bg-blob bg-blob-b" />

      {role === "SUPERADMIN" ? (
        <SuperAdminArea session={session} health={health} onLogout={handleLogout} />
      ) : role === "DOCTOR" ? (
        <DoctorArea session={session} health={health} onLogout={handleLogout} />
      ) : (
        <PatientArea session={session} health={health} onLogout={handleLogout} />
      )}
    </div>
  );
}
