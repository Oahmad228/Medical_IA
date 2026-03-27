import React, { useEffect, useState } from "react";
import { api, apiStreamChatMessage } from "../lib/api";
import { filesToDataUrls, patientAssistantMeta } from "../lib/utils";
import TopBar from "../components/TopBar";
import ChatLayout from "../components/ChatLayout";
import ChibiStage from "../components/ChibiStage";

const APPOINTMENT_STATUS_LABELS = {
  REQUESTED: "En attente",
  ACCEPTED: "Accepte",
  REJECTED: "Refuse",
  CANCELED: "Annule",
  RESCHEDULED: "Replanifie",
};

export default function PatientArea({ session, onLogout, onSessionUpdate }) {
  const token = session.token;
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [composer, setComposer] = useState({ message: "", location: "", patientId: "", images: [] });
  const [lastTriage, setLastTriage] = useState("GREEN");
  const [lastEmotionLevel, setLastEmotionLevel] = useState(null);
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
  const [appointments, setAppointments] = useState([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState("");
  const [appointmentForm, setAppointmentForm] = useState({
    doctorUserId: "",
    scheduledFor: "",
    note: "",
  });
  const [appointmentActionLoading, setAppointmentActionLoading] = useState(false);
  const [appointmentActionError, setAppointmentActionError] = useState("");
  const [appointmentsOpen, setAppointmentsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsView, setSettingsView] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsInfo, setSettingsInfo] = useState("");
  const [profileForm, setProfileForm] = useState({
    fullName: session.user.fullName || "",
    age: "",
    sex: "",
    city: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [displayName, setDisplayName] = useState(session.user.fullName || "");

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
      if (data?.report?.emotionLevel) {
        setLastEmotionLevel(data.report.emotionLevel);
      }
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

  async function refreshAppointments() {
    try {
      setAppointmentsLoading(true);
      setAppointmentsError("");
      const data = await api("/patient/appointments", { token });
      setAppointments(Array.isArray(data?.appointments) ? data.appointments : []);
    } catch (e) {
      setAppointmentsError(e.message || "Impossible de charger les reservations.");
      setAppointments([]);
    } finally {
      setAppointmentsLoading(false);
    }
  }

  async function requestAppointment() {
    const doctorUserId = Number(appointmentForm.doctorUserId || "");
    if (!Number.isInteger(doctorUserId) || doctorUserId <= 0) {
      setAppointmentActionError("ID medecin requis.");
      return;
    }

    setAppointmentActionError("");
    setAppointmentActionLoading(true);
    try {
      const payload = {
        doctorUserId,
        scheduledFor: appointmentForm.scheduledFor || undefined,
        note: appointmentForm.note || undefined,
      };
      await api("/patient/appointments/request", {
        method: "POST",
        token,
        payload,
      });
      setAppointmentForm((prev) => ({ ...prev, note: "" }));
      await refreshAppointments();
    } catch (e) {
      setAppointmentActionError(e.message || "Impossible de demander un rendez-vous.");
    } finally {
      setAppointmentActionLoading(false);
    }
  }

  async function cancelAppointment(appointmentId) {
    if (!window.confirm("Annuler cette reservation ?")) return;
    setAppointmentActionError("");
    setAppointmentActionLoading(true);
    try {
      await api(`/patient/appointments/${appointmentId}/cancel`, {
        method: "POST",
        token,
        payload: { note: appointmentForm.note || undefined },
      });
      await refreshAppointments();
    } catch (e) {
      setAppointmentActionError(e.message || "Impossible d'annuler.");
    } finally {
      setAppointmentActionLoading(false);
    }
  }

  async function loadAccountProfile() {
    const data = await api("/auth/me", { token });
    const user = data?.user || {};
    setProfileForm({
      fullName: user.fullName || "",
      age: user.age ?? "",
      sex: user.sex ?? "",
      city: user.city ?? "",
    });
  }

  async function openSettings(view) {
    setSettingsView(view);
    setSettingsOpen(true);
    setSettingsError("");
    setSettingsInfo("");
    setAppointmentsOpen(false);
    setReportOpen(false);
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

  function openAppointments() {
    setAppointmentsOpen(true);
    setSettingsOpen(false);
    setSettingsView(null);
    setReportOpen(false);
  }

  function openReport() {
    setReportOpen(true);
    setAppointmentsOpen(false);
    setSettingsOpen(false);
    setSettingsView(null);
  }

  async function saveProfile() {
    setSettingsError("");
    setSettingsInfo("");
    setSettingsLoading(true);
    try {
      const payload = {
        fullName: profileForm.fullName || undefined,
        age: profileForm.age === "" ? null : Number(profileForm.age),
        sex: profileForm.sex || undefined,
        city: profileForm.city || undefined,
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
            if (evt?.type === "meta" && evt.emotionLevel) {
              setLastEmotionLevel(evt.emotionLevel);
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
        if (result.emotionLevel) setLastEmotionLevel(result.emotionLevel);
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
    refreshAppointments().catch(() => {});
    const timer = setInterval(() => {
      refreshPatientReport();
      refreshLatestSymptom().catch(() => {});
      refreshConsultStatus().catch(() => {});
      refreshAppointments().catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const doctorId = consultStatus?.doctor?.userId;
    if (!appointmentForm.doctorUserId && doctorId) {
      setAppointmentForm((prev) => ({ ...prev, doctorUserId: String(doctorId) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultStatus?.doctor?.userId]);

  const assistant = patientAssistantMeta(session?.user?.assistantPersona);
  const indicatorLevel = String(
    latestSymptomReport?.emotionLevel ||
      lastEmotionLevel ||
      latestSymptomReport?.triageLevel ||
      lastTriage ||
      latestReport?.emotionLevel ||
      latestReport?.triageLevel
  ).toUpperCase();
  const chibiMessage = latestReport?.patientFinalText
    ? "Mon medecin a valide un rapport. Cliquez pour le lire."
    : indicatorLevel === "RED"
    ? "Alerte: consultez en urgence maintenant."
    : indicatorLevel === "ORANGE"
    ? "Vigilance: une consultation rapide est conseillee."
    : "Tout est calme. Continuez la surveillance.";

  return (
    <>
      <TopBar
        subtitle="Espace Patient"
        userName={displayName || session.user.fullName}
        onLogout={onLogout}
        showAppointments
        onOpenAppointments={openAppointments}
        onOpenSettings={openSettings}
      />

      <ChatLayout
        role="PATIENT"
        layoutVariant="patient"
        showLocationInput
        showPatientIdInput={false}
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
              indicatorLevel={indicatorLevel}
              message={chibiMessage}
              hasReport={Boolean(latestReport?.patientFinalText)}
              onOpenReport={openReport}
            />

            {String(indicatorLevel || "").toUpperCase() === "ORANGE" ||
            String(indicatorLevel || "").toUpperCase() === "RED" ? (
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

      {appointmentsOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setAppointmentsOpen(false)}
        >
          <div
            className="modal-window modal-window--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>Fil des reservations</h3>
              <button
                type="button"
                className="ghost modal-close"
                onClick={() => setAppointmentsOpen(false)}
              >
                Fermer
              </button>
            </div>
            <div className="modal-body">
              <div className="appointment-thread">
                <div className="appointment-thread__form">
                  <h4>Nouvelle demande</h4>
                  <label htmlFor="appointment-doctor-id">Medecin (ID)</label>
                  <input
                    id="appointment-doctor-id"
                    value={appointmentForm.doctorUserId}
                    onChange={(e) =>
                      setAppointmentForm((prev) => ({ ...prev, doctorUserId: e.target.value }))
                    }
                    placeholder="ex: 12"
                  />

                  <label htmlFor="appointment-time">Date/heure souhaitee</label>
                  <input
                    id="appointment-time"
                    type="datetime-local"
                    value={appointmentForm.scheduledFor}
                    onChange={(e) =>
                      setAppointmentForm((prev) => ({ ...prev, scheduledFor: e.target.value }))
                    }
                  />

                  <label htmlFor="appointment-note">Note (optionnel)</label>
                  <textarea
                    id="appointment-note"
                    rows={3}
                    value={appointmentForm.note}
                    onChange={(e) =>
                      setAppointmentForm((prev) => ({ ...prev, note: e.target.value }))
                    }
                    placeholder="Motif, contraintes horaires, etc."
                  />

                  <button
                    type="button"
                    disabled={appointmentActionLoading}
                    onClick={requestAppointment}
                  >
                    {appointmentActionLoading ? "Envoi..." : "Demander un rendez-vous"}
                  </button>

                  {appointmentActionError ? (
                    <p className="error-text">{appointmentActionError}</p>
                  ) : null}
                  {appointmentsError ? <p className="error-text">{appointmentsError}</p> : null}
                </div>

                <div className="appointment-thread__list">
                  <h4>Historique</h4>
                  {appointmentsLoading ? <p className="muted">Chargement...</p> : null}
                  {appointments.length === 0 && !appointmentsLoading ? (
                    <p className="muted">Aucune reservation pour le moment.</p>
                  ) : null}

                  <div className="appointment-list">
                    {appointments.map((appt) => {
                      const status = String(appt.status || "");
                      const statusLabel = APPOINTMENT_STATUS_LABELS[status] || status;
                      return (
                        <div key={appt.id} className="appointment-item">
                          <div className="appointment-row">
                            <div className={`appointment-badge appointment-badge--${status.toLowerCase()}`}>
                              {statusLabel}
                            </div>
                            <span className="muted">#{appt.id}</span>
                          </div>
                          <p className="muted">
                            Medecin: {appt.doctor?.fullName || "N/A"}
                            {appt.doctor?.specialty ? ` (${appt.doctor.specialty})` : ""}
                          </p>
                          <p className="muted">
                            Date: {appt.scheduledFor ? new Date(appt.scheduledFor).toLocaleString() : "A definir"}
                          </p>
                          {appt.doctorNote ? (
                            <p className="muted">Note medecin: {appt.doctorNote}</p>
                          ) : null}
                          {appt.status !== "CANCELED" && appt.status !== "REJECTED" ? (
                            <button
                              type="button"
                              className="ghost small"
                              disabled={appointmentActionLoading}
                              onClick={() => cancelAppointment(appt.id)}
                            >
                              Annuler
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
                  <label htmlFor="profile-fullname">Nom complet</label>
                  <input
                    id="profile-fullname"
                    value={profileForm.fullName}
                    onChange={(e) =>
                      setProfileForm((prev) => ({ ...prev, fullName: e.target.value }))
                    }
                  />

                  <label htmlFor="profile-age">Age</label>
                  <input
                    id="profile-age"
                    type="number"
                    min="0"
                    max="120"
                    value={profileForm.age}
                    onChange={(e) =>
                      setProfileForm((prev) => ({ ...prev, age: e.target.value }))
                    }
                  />

                  <label htmlFor="profile-sex">Sexe</label>
                  <input
                    id="profile-sex"
                    value={profileForm.sex}
                    onChange={(e) =>
                      setProfileForm((prev) => ({ ...prev, sex: e.target.value }))
                    }
                    placeholder="ex: F, M, Autre"
                  />

                  <label htmlFor="profile-city">Ville</label>
                  <input
                    id="profile-city"
                    value={profileForm.city}
                    onChange={(e) =>
                      setProfileForm((prev) => ({ ...prev, city: e.target.value }))
                    }
                  />

                  <button type="button" disabled={settingsLoading} onClick={saveProfile}>
                    {settingsLoading ? "Enregistrement..." : "Enregistrer"}
                  </button>
                </div>
              ) : null}

              {settingsView === "password" ? (
                <div className="form-stack">
                  <label htmlFor="current-password">Mot de passe actuel</label>
                  <input
                    id="current-password"
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) =>
                      setPasswordForm((prev) => ({
                        ...prev,
                        currentPassword: e.target.value,
                      }))
                    }
                  />

                  <label htmlFor="new-password">Nouveau mot de passe</label>
                  <input
                    id="new-password"
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) =>
                      setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))
                    }
                  />

                  <label htmlFor="confirm-password">Confirmer le mot de passe</label>
                  <input
                    id="confirm-password"
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
                    Cette action est definitive. Toutes vos conversations, rapports et reservations
                    seront supprimes.
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
