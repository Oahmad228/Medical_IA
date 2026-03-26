import React, { useEffect, useState } from "react";
import { api, apiStreamChatMessage } from "../lib/api";
import { filesToDataUrls } from "../lib/utils";
import TopBar from "../components/TopBar";
import ChatLayout from "../components/ChatLayout";

export default function DoctorArea({ session, health, onLogout }) {
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
