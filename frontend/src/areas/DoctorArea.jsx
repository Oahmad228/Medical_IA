import React, { useEffect, useState } from "react";
import { api, apiStreamChatMessage } from "../lib/api";
import { filesToDataUrls } from "../lib/utils";
import TopBar from "../components/TopBar";
import ChatLayout from "../components/ChatLayout";

const APPOINTMENT_STATUS_LABELS = {
  REQUESTED: "En attente",
  ACCEPTED: "Accepte",
  REJECTED: "Refuse",
  CANCELED: "Annule",
  RESCHEDULED: "Replanifie",
};

export default function DoctorArea({ session, onLogout, onSessionUpdate }) {
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
  const [displayName, setDisplayName] = useState(session.user.fullName || "");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsView, setSettingsView] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsInfo, setSettingsInfo] = useState("");
  const [profileForm, setProfileForm] = useState({
    fullName: session.user.fullName || "",
    specialty: "",
    yearsExperience: "",
    bio: "",
    clinicName: "",
    clinicAddress: "",
    clinicCity: "",
    clinicLat: "",
    clinicLng: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [pendingLinks, setPendingLinks] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState("");
  const [appointments, setAppointments] = useState([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState("");
  const [appointmentEdits, setAppointmentEdits] = useState({});
  const [appointmentActionLoading, setAppointmentActionLoading] = useState(false);
  const [appointmentActionError, setAppointmentActionError] = useState("");

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

  async function loadAccountProfile() {
    const data = await api("/auth/me", { token });
    const user = data?.user || {};
    const doctorProfile = user.doctorProfile || {};
    setProfileForm({
      fullName: user.fullName || "",
      specialty: doctorProfile.specialty || "",
      yearsExperience: doctorProfile.yearsExperience ?? "",
      bio: doctorProfile.bio ?? "",
      clinicName: doctorProfile.clinicName ?? "",
      clinicAddress: doctorProfile.clinicAddress ?? "",
      clinicCity: doctorProfile.clinicCity ?? "",
      clinicLat: doctorProfile.clinicLat ?? "",
      clinicLng: doctorProfile.clinicLng ?? "",
    });
  }

  async function openSettings(view) {
    setSettingsView(view);
    setSettingsOpen(true);
    setSettingsError("");
    setSettingsInfo("");
    if (view === "profile") {
      setSettingsLoading(true);
      try {
        await loadAccountProfile();
      } catch (e) {
        setSettingsError(e.message || "Impossible de charger le profil.");
      } finally {
        setSettingsLoading(false);
      }
    }
  }

  function closeSettings() {
    setSettingsOpen(false);
    setSettingsView(null);
    setSettingsError("");
    setSettingsInfo("");
  }

  async function saveProfile() {
    setSettingsError("");
    setSettingsInfo("");
    setSettingsLoading(true);
    try {
      const payload = {
        fullName: profileForm.fullName || undefined,
        specialty: profileForm.specialty || undefined,
        yearsExperience: profileForm.yearsExperience === "" ? null : Number(profileForm.yearsExperience),
        bio: profileForm.bio || undefined,
        clinicName: profileForm.clinicName || undefined,
        clinicAddress: profileForm.clinicAddress || undefined,
        clinicCity: profileForm.clinicCity || undefined,
        clinicLat: profileForm.clinicLat === "" ? null : Number(profileForm.clinicLat),
        clinicLng: profileForm.clinicLng === "" ? null : Number(profileForm.clinicLng),
      };
      const data = await api("/auth/me", { method: "PATCH", token, payload });
      if (data?.user?.fullName) setDisplayName(data.user.fullName);
      if (typeof onSessionUpdate === "function") {
        onSessionUpdate({
          ...session,
          token: data?.token || session.token,
          user: { ...session.user, ...data.user },
        });
      }
      setSettingsInfo("Profil mis a jour.");
    } catch (e) {
      setSettingsError(e.message || "Impossible de mettre a jour le profil.");
    } finally {
      setSettingsLoading(false);
    }
  }

  async function changePassword() {
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      setSettingsError("Mot de passe actuel et nouveau requis.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setSettingsError("La confirmation du mot de passe ne correspond pas.");
      return;
    }

    setSettingsError("");
    setSettingsInfo("");
    setSettingsLoading(true);
    try {
      const payload = {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      };
      const data = await api("/auth/me/change-password", { method: "POST", token, payload });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setSettingsInfo(data?.message || "Mot de passe mis a jour.");
    } catch (e) {
      setSettingsError(e.message || "Impossible de changer le mot de passe.");
    } finally {
      setSettingsLoading(false);
    }
  }

  async function deleteAccount() {
    if (!window.confirm("Supprimer votre compte et toutes vos donnees ?")) return;
    setSettingsError("");
    setSettingsInfo("");
    setSettingsLoading(true);
    try {
      await api("/auth/me", { method: "DELETE", token });
      await onLogout();
    } catch (e) {
      setSettingsError(e.message || "Impossible de supprimer le compte.");
    } finally {
      setSettingsLoading(false);
    }
  }

  async function refreshAppointments() {
    try {
      setAppointmentsLoading(true);
      setAppointmentsError("");
      const data = await api("/doctor/appointments", { token });
      setAppointments(Array.isArray(data?.appointments) ? data.appointments : []);
    } catch (e) {
      setAppointmentsError(e.message || "Erreur chargement reservations.");
      setAppointments([]);
    } finally {
      setAppointmentsLoading(false);
    }
  }

  function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString();
  }

  function getAppointmentEdit(id) {
    return appointmentEdits[id] || { note: "", scheduledFor: "" };
  }

  function updateAppointmentEdit(id, updates) {
    setAppointmentEdits((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...updates },
    }));
  }

  async function handleAppointmentAction(appointmentId, action) {
    const edit = getAppointmentEdit(appointmentId);
    if (action === "reschedule" && !String(edit.scheduledFor || "").trim()) {
      setAppointmentActionError("Date/heure requise pour replanifier.");
      return;
    }

    try {
      setAppointmentActionLoading(true);
      setAppointmentActionError("");
      const payload = {};
      if (String(edit.note || "").trim()) payload.note = String(edit.note || "").trim();
      if (String(edit.scheduledFor || "").trim()) {
        payload.scheduledFor = String(edit.scheduledFor || "").trim();
      }
      await api(`/doctor/appointments/${appointmentId}/${action}`, {
        method: "POST",
        token,
        payload,
      });
      await refreshAppointments();
    } catch (e) {
      setAppointmentActionError(e.message || "Erreur mise a jour reservation.");
    } finally {
      setAppointmentActionLoading(false);
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
        {
          id: tempUserId,
          author: "USER",
          content: trimmedMessage,
          images: Array.isArray(composer.images) ? composer.images : [],
          createdAt: new Date().toISOString(),
        },
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
    const refreshTools = () => {
      refreshPendingLinks().catch(() => {});
      refreshAppointments().catch(() => {});
    };
    refreshTools();
    const timer = setInterval(refreshTools, 20000);
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
        subtitle="Espace Medecin"
        userName={displayName || session.user.fullName}
        onLogout={onLogout}
        onOpenSettings={openSettings}
      />

      <ChatLayout
        role="DOCTOR"
        layoutVariant="doctor"
        composerMetaMode="doctor"
        showLocationInput={false}
        showPatientIdInput={false}
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

            <section className="tool-section">
              <h3 className="tool-section__title">3. Rendez-vous</h3>
              <p className="tool-section__hint muted">
                Acceptez, refusez ou proposez une nouvelle date aux patients.
              </p>
              {appointmentsError ? <p className="error-text">{appointmentsError}</p> : null}
              {appointmentActionError ? <p className="error-text">{appointmentActionError}</p> : null}
              {appointmentsLoading ? <p className="muted">Chargement des rendez-vous...</p> : null}

              {!appointmentsLoading && appointments.length === 0 ? (
                <p className="muted">Aucune reservation en attente.</p>
              ) : null}

              {appointments.map((appointment) => {
                const status = String(appointment?.status || "");
                const patient = appointment?.patient || {};
                const edit = getAppointmentEdit(appointment.id);
                const statusLabel = APPOINTMENT_STATUS_LABELS[status] || status || "-";
                const canAccept = status === "REQUESTED" || status === "RESCHEDULED";
                const canReject = status === "REQUESTED";
                const canReschedule = !["REJECTED", "CANCELED"].includes(status);
                const canCancel = !["REJECTED", "CANCELED"].includes(status);

                return (
                  <div key={appointment.id} className="history-block">
                    <div className="muted">
                      <strong>{patient.fullName || "Patient"}</strong> #{appointment.id}
                    </div>
                    <div className="muted">
                      Statut : <strong>{statusLabel}</strong>
                    </div>
                    {appointment.requestedAt ? (
                      <div className="muted">
                        Demande : {formatDateTime(appointment.requestedAt)}
                      </div>
                    ) : null}
                    <div className="muted">
                      Date proposee :{" "}
                      {appointment.scheduledFor
                        ? formatDateTime(appointment.scheduledFor)
                        : "Non specifiee"}
                    </div>
                    {patient.email ? <div className="muted">Email : {patient.email}</div> : null}
                    {patient.city ? <div className="muted">Ville : {patient.city}</div> : null}

                    {appointment.patientNote ? (
                      <div className="output">Note patient : {appointment.patientNote}</div>
                    ) : null}
                    {appointment.doctorNote ? (
                      <div className="output">Note medecin : {appointment.doctorNote}</div>
                    ) : null}

                    <label htmlFor={`doctor-note-${appointment.id}`}>Message au patient</label>
                    <textarea
                      id={`doctor-note-${appointment.id}`}
                      rows={3}
                      placeholder="Message ou consigne (optionnel)"
                      value={edit.note || ""}
                      onChange={(e) => updateAppointmentEdit(appointment.id, { note: e.target.value })}
                    />

                    <label htmlFor={`doctor-schedule-${appointment.id}`}>Nouvelle date/heure</label>
                    <input
                      id={`doctor-schedule-${appointment.id}`}
                      type="datetime-local"
                      value={edit.scheduledFor || ""}
                      onChange={(e) =>
                        updateAppointmentEdit(appointment.id, { scheduledFor: e.target.value })
                      }
                    />

                    <div className="button-row">
                      <button
                        type="button"
                        className="ghost small"
                        disabled={appointmentActionLoading || !canAccept}
                        onClick={() => handleAppointmentAction(appointment.id, "accept")}
                      >
                        Accepter
                      </button>
                      <button
                        type="button"
                        className="ghost small"
                        disabled={appointmentActionLoading || !canReject}
                        onClick={() => handleAppointmentAction(appointment.id, "reject")}
                      >
                        Refuser
                      </button>
                      <button
                        type="button"
                        className="ghost small"
                        disabled={appointmentActionLoading || !canReschedule}
                        onClick={() => handleAppointmentAction(appointment.id, "reschedule")}
                      >
                        Replanifier
                      </button>
                      <button
                        type="button"
                        className="ghost small"
                        disabled={appointmentActionLoading || !canCancel}
                        onClick={() => handleAppointmentAction(appointment.id, "cancel")}
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="tool-section tool-section--last">
              <h3 className="tool-section__title">4. Rapport patient</h3>
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

      {settingsOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={closeSettings}
        >
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>
                {settingsView === "password"
                  ? "Changer le mot de passe"
                  : settingsView === "delete"
                  ? "Supprimer le compte"
                  : "Modifier mes informations"}
              </h3>
              <button type="button" className="ghost modal-close" onClick={closeSettings}>
                Fermer
              </button>
            </div>
            <div className="modal-body">
              {settingsError ? <p className="error-text">{settingsError}</p> : null}
              {settingsInfo ? <p className="info-text">{settingsInfo}</p> : null}

              {settingsView === "profile" ? (
                <div className="form-stack">
                  <label htmlFor="doctor-fullname">Nom complet</label>
                  <input
                    id="doctor-fullname"
                    value={profileForm.fullName}
                    onChange={(e) =>
                      setProfileForm((prev) => ({ ...prev, fullName: e.target.value }))
                    }
                  />

                  <label htmlFor="doctor-specialty">Specialite</label>
                  <input
                    id="doctor-specialty"
                    value={profileForm.specialty}
                    onChange={(e) =>
                      setProfileForm((prev) => ({ ...prev, specialty: e.target.value }))
                    }
                  />

                  <label htmlFor="doctor-experience">Annees d'experience</label>
                  <input
                    id="doctor-experience"
                    type="number"
                    min="0"
                    max="80"
                    value={profileForm.yearsExperience}
                    onChange={(e) =>
                      setProfileForm((prev) => ({ ...prev, yearsExperience: e.target.value }))
                    }
                  />

                  <label htmlFor="doctor-bio">Bio</label>
                  <textarea
                    id="doctor-bio"
                    rows={3}
                    value={profileForm.bio}
                    onChange={(e) =>
                      setProfileForm((prev) => ({ ...prev, bio: e.target.value }))
                    }
                  />

                  <label htmlFor="doctor-clinic-name">Cabinet</label>
                  <input
                    id="doctor-clinic-name"
                    value={profileForm.clinicName}
                    onChange={(e) =>
                      setProfileForm((prev) => ({ ...prev, clinicName: e.target.value }))
                    }
                  />

                  <label htmlFor="doctor-clinic-address">Adresse</label>
                  <input
                    id="doctor-clinic-address"
                    value={profileForm.clinicAddress}
                    onChange={(e) =>
                      setProfileForm((prev) => ({ ...prev, clinicAddress: e.target.value }))
                    }
                  />

                  <label htmlFor="doctor-clinic-city">Ville</label>
                  <input
                    id="doctor-clinic-city"
                    value={profileForm.clinicCity}
                    onChange={(e) =>
                      setProfileForm((prev) => ({ ...prev, clinicCity: e.target.value }))
                    }
                  />

                  <div className="field-row">
                    <div>
                      <label htmlFor="doctor-clinic-lat">Latitude</label>
                      <input
                        id="doctor-clinic-lat"
                        value={profileForm.clinicLat}
                        onChange={(e) =>
                          setProfileForm((prev) => ({ ...prev, clinicLat: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <label htmlFor="doctor-clinic-lng">Longitude</label>
                      <input
                        id="doctor-clinic-lng"
                        value={profileForm.clinicLng}
                        onChange={(e) =>
                          setProfileForm((prev) => ({ ...prev, clinicLng: e.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <button type="button" disabled={settingsLoading} onClick={saveProfile}>
                    {settingsLoading ? "Enregistrement..." : "Enregistrer"}
                  </button>
                </div>
              ) : null}

              {settingsView === "password" ? (
                <div className="form-stack">
                  <label htmlFor="doctor-current-password">Mot de passe actuel</label>
                  <input
                    id="doctor-current-password"
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) =>
                      setPasswordForm((prev) => ({
                        ...prev,
                        currentPassword: e.target.value,
                      }))
                    }
                  />

                  <label htmlFor="doctor-new-password">Nouveau mot de passe</label>
                  <input
                    id="doctor-new-password"
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) =>
                      setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))
                    }
                  />

                  <label htmlFor="doctor-confirm-password">Confirmer le mot de passe</label>
                  <input
                    id="doctor-confirm-password"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) =>
                      setPasswordForm((prev) => ({
                        ...prev,
                        confirmPassword: e.target.value,
                      }))
                    }
                  />

                  <button type="button" disabled={settingsLoading} onClick={changePassword}>
                    {settingsLoading ? "Mise a jour..." : "Mettre a jour"}
                  </button>
                </div>
              ) : null}

              {settingsView === "delete" ? (
                <div className="form-stack">
                  <p className="muted">
                    Cette action est definitive. Tous vos rapports et reservations seront supprimes.
                  </p>
                  <button
                    type="button"
                    className="danger"
                    disabled={settingsLoading}
                    onClick={deleteAccount}
                  >
                    {settingsLoading ? "Suppression..." : "Supprimer mon compte"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
