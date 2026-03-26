import React, { useEffect, useState } from "react";
import { api, apiStreamChatMessage } from "../lib/api";
import { filesToDataUrls, patientAssistantMeta } from "../lib/utils";
import TopBar from "../components/TopBar";
import ChatLayout from "../components/ChatLayout";
import ChibiStage from "../components/ChibiStage";

export default function PatientArea({ session, health, onLogout }) {
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
