import React, { useEffect, useMemo, useState } from "react";

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
    return { label: "Infirmier", image: "/chibi/nurse.png" };
  }
  if (key === "OWL") {
    return { label: "Hibou", image: "/chibi/owl.png" };
  }
  if (key === "RESCUE_DOG") {
    return { label: "Chien de secours", image: "/chibi/rescue_dog.png" };
  }
  return { label: "Docteur", image: "/chibi/doctor.png" };
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
        <span className={`health-pill ${health.state}`}>{health.label}</span>
        <button className="ghost" type="button" onClick={onLogout}>
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
            <button
              type="button"
              className="inline-link"
              onClick={() => goTo("forgot")}
            >
              Mot de passe oublie ?
            </button>
            <button type="submit" disabled={loading}>
              {loading ? "Connexion..." : "Se connecter"}
            </button>

            <p className="auth-footnote">
              Vous n'avez pas de compte ?
              <button
                type="button"
                className="inline-link"
                onClick={() => {
                  setSignupStep("role");
                  goTo("signup");
                }}
              >
                Cliquez ici
              </button>
            </p>

            <p className="auth-footnote">
              Email non verifie ?
              <button
                type="button"
                className="inline-link"
                onClick={() => goTo("verify")}
              >
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
  conversations,
  selectedConversationId,
  onSelectConversation,
  onCreateConversation,
  messages,
  composer,
  setComposer,
  onSend,
  sending,
  sendError,
  rightPanel,
  imagePreviews,
  onPickImages,
  onRemoveImage,
}) {
  return (
    <section className="chat-shell">
      <aside className="panel history-panel">
        <div className="panel-head">
          <h2>Historique</h2>
          <button type="button" className="small" onClick={onCreateConversation}>
            + Nouveau
          </button>
        </div>
        <div className="history-list">
          {conversations.length === 0 ? (
            <p className="muted">Aucune conversation.</p>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                className={
                  conversation.id === selectedConversationId
                    ? "history-item active"
                    : "history-item"
                }
                onClick={() => onSelectConversation(conversation.id)}
              >
                <strong>{conversation.title}</strong>
                <span>{new Date(conversation.updatedAt).toLocaleString()}</span>
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="panel conversation-panel">
        <div className="panel-head">
          <h2>{role === "DOCTOR" ? "Assistant Clinique" : "Assistant Patient"}</h2>
        </div>
        <div className="chat-stream">
          {messages.length === 0 ? (
            <p className="muted">Envoyez un premier message pour lancer l'analyse.</p>
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
          className="composer"
          onSubmit={async (event) => {
            event.preventDefault();
            await onSend();
          }}
        >
          <textarea
            rows="3"
            placeholder="Decrivez votre situation medicale..."
            value={composer.message}
            onChange={(e) =>
              setComposer((prev) => ({ ...prev, message: e.target.value }))
            }
            required
          />
          <div className="image-uploader">
            <label className="image-uploader-label">Images (optionnel, max 3)</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={async (e) => {
                if (typeof onPickImages === "function") {
                  await onPickImages(e.target.files);
                  e.target.value = "";
                }
              }}
            />
            {Array.isArray(imagePreviews) && imagePreviews.length > 0 ? (
              <div className="image-preview-list">
                {imagePreviews.map((src, idx) => (
                  <div key={`${src}-${idx}`} className="image-preview-item">
                    <img src={src} alt={`piece-jointe-${idx + 1}`} />
                    <button type="button" className="ghost small" onClick={() => onRemoveImage?.(idx)}>
                      Retirer
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="composer-extra">
            <input
              placeholder="Localisation (optionnel)"
              value={composer.location}
              onChange={(e) =>
                setComposer((prev) => ({ ...prev, location: e.target.value }))
              }
            />
            <input
              placeholder="Patient ID (optionnel)"
              value={composer.patientId}
              onChange={(e) =>
                setComposer((prev) => ({ ...prev, patientId: e.target.value }))
              }
            />
            <button type="submit" disabled={sending}>
              {sending ? "Envoi..." : "Envoyer"}
            </button>
          </div>
          {sendError ? <p className="error-text composer-status">{sendError}</p> : null}
        </form>
      </main>

      <aside className="panel risk-panel">
        {rightPanel}
      </aside>
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

  async function refreshPatientReport() {
    try {
      const data = await api("/patient/reports/latest", { token });
      setLatestReport(data?.report || null);
    } catch (_e) {
      setLatestReport(null);
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
    const timer = setInterval(() => {
      refreshPatientReport();
    }, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const assistant = patientAssistantMeta(session?.user?.assistantPersona);
  const effectiveTriage = String(latestReport?.triageLevel || lastTriage).toUpperCase();
  const chibiState =
    effectiveTriage === "RED"
      ? "chibi-red"
      : effectiveTriage === "ORANGE"
      ? "chibi-orange"
      : "chibi-green";
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
        conversations={conversations}
        selectedConversationId={selectedConversationId}
        onSelectConversation={async (id) => {
          setSelectedConversationId(id);
          await loadConversation(id);
        }}
        onCreateConversation={createConversation}
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
          <>
            <h2>Assistant patient</h2>
            <div
              className={`chibi-card ${chibiState}`}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (latestReport?.patientFinalText) setReportOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && latestReport?.patientFinalText) setReportOpen(true);
              }}
            >
              <div className="chibi-avatar" aria-hidden="true">
                <img src={assistant.image} alt={assistant.label} />
              </div>
              <div className="chibi-text">
                <strong>{assistant.label}</strong>
                <p>{chibiMessage}</p>
              </div>
            </div>
          </>
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
  }

  async function createConversation() {
    const created = await api("/chat/conversations", {
      method: "POST",
      token,
      payload: { title: "Nouveau dossier clinique" },
    });
    await refreshConversations(created.id);
    return created.id;
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
        conversationId = await createConversation();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        conversations={conversations}
        selectedConversationId={selectedConversationId}
        onSelectConversation={async (id) => {
          setSelectedConversationId(id);
          await loadConversation(id);
        }}
        onCreateConversation={createConversation}
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
          <>
            <h2>Association médecin-patient (OTP)</h2>
            <p className="muted">
              1) Entrez l'ID patient dans le champ du dossier. 2) Demandez l'OTP. 3) Confirmez avec le code reçu par email.
            </p>

            <div className="pairing-box">
              <div className="muted">
                Statut: <strong>{String(pairStatus).toUpperCase()}</strong>
              </div>

              {pairError ? <p className="error-text">{pairError}</p> : null}

              <button
                type="button"
                disabled={pairLoading || !composer.patientId.trim()}
                onClick={async () => {
                  try {
                    setPairError("");
                    setPairLoading(true);
                    const pid = Number(composer.patientId);
                    if (!pid || Number.isNaN(pid)) {
                      setPairError("ID patient invalide.");
                      return;
                    }
                    await api("/doctor/patient-link/request-otp", {
                      method: "POST",
                      token,
                      payload: { patientId: pid },
                    });
                    setOtpCode("");
                    setPairStatus("PENDING");
                    await refreshPairStatus(pid);
                  } catch (e) {
                    setPairError(e.message || "Erreur OTP.");
                  } finally {
                    setPairLoading(false);
                  }
                }}
              >
                {pairLoading ? "Envoi OTP..." : "Demander OTP"}
              </button>

              <label>Code OTP</label>
              <input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder="ex: 123456" />

              <button
                type="button"
                disabled={pairLoading || !composer.patientId.trim() || !otpCode.trim()}
                onClick={async () => {
                  try {
                    setPairError("");
                    setPairLoading(true);
                    const pid = Number(composer.patientId);
                    await api("/doctor/patient-link/confirm-otp", {
                      method: "POST",
                      token,
                      payload: { patientId: pid, otp: otpCode.trim() },
                    });
                    setOtpCode("");
                    await refreshPairStatus(pid);
                  } catch (e) {
                    setPairError(e.message || "OTP incorrect.");
                  } finally {
                    setPairLoading(false);
                  }
                }}
              >
                Confirmer OTP
              </button>
            </div>

            <h2>Validation du rapport</h2>
            {approveError ? <p className="error-text">{approveError}</p> : null}

            <div className="history-block">
              {draftLoading ? (
                <p className="muted">Chargement du dernier draft...</p>
              ) : latestDraftReport ? (
                <>
                  <div className="muted">
                    Triage: <strong>{String(latestDraftReport?.triageLevel || "").toUpperCase()}</strong>
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
                <p className="muted">Aucun rapport draft pour cet patient.</p>
              )}
            </div>
          </>
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
