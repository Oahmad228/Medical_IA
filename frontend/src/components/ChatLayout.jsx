import React, { useRef, useState } from "react";
import { safeJsonParse } from "../lib/utils";

export default function ChatLayout({
  role,
  layoutVariant,
  /** patient: ID optionnel sous le composer ; doctor: ID uniquement dans le panneau droit */
  composerMetaMode = "patient",
  showLocationInput = true,
  showPatientIdInput = false,
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const isPatient = layoutVariant === "patient";
  const isDoctorMeta = composerMetaMode === "doctor";

  const handleSelectConversation = async (id) => {
    setHistoryOpen(false);
    await onSelectConversation(id);
  };

  return (
    <section className={`chat-shell ${isPatient ? "chat-shell--patient" : "chat-shell--doctor"}`}>
      {historyOpen ? (
        <button
          type="button"
          className="history-overlay"
          aria-label="Fermer la liste des conversations"
          onClick={() => setHistoryOpen(false)}
        />
      ) : null}
      <aside
        className={`panel history-panel glass-panel ${historyOpen ? "history-panel--open" : ""}`}
      >
        <div className="panel-head">
          <h2>Conversations</h2>
          <div className="panel-head-actions">
            <button
              type="button"
              className="btn-pill"
              onClick={async () => {
                await onCreateConversation();
                setHistoryOpen(false);
              }}
            >
              + Nouveau
            </button>
            <button
              type="button"
              className="history-close"
              aria-label="Fermer"
              onClick={() => setHistoryOpen(false)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6l-12 12"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
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
                  onClick={() => handleSelectConversation(conversation.id)}
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
          <button
            type="button"
            className="history-toggle"
            onClick={() => setHistoryOpen(true)}
          >
            Conversations
          </button>
          <div>
            <p className="chat-eyebrow">Discussion</p>
            <h2>{role === "DOCTOR" ? "Assistant clinique" : "Assistant patient"}</h2>
          </div>
        </div>
        <div className="chat-stream">
          {messages.length === 0 ? (
            <p className="muted chat-empty">Écrivez un message pour lancer l’analyse.</p>
          ) : (
            messages.map((m) => {
              const imageList = Array.isArray(m.images)
                ? m.images
                : safeJsonParse(m.imagesJson) || [];
              const images = imageList
                .map((img) => String(img || "").trim())
                .filter((img) => img.startsWith("data:image/") || /^https?:\/\//i.test(img));

              return (
                <article
                  key={m.id}
                  className={m.author === "USER" ? "bubble bubble-user" : "bubble bubble-ai"}
                >
                  <p>{m.content}</p>
                  {images.length > 0 ? (
                    <div className="bubble-images">
                      {images.map((src, idx) => (
                        <img key={`${m.id}-img-${idx}`} src={src} alt="" loading="lazy" />
                      ))}
                    </div>
                  ) : null}
                  <span className="bubble-time">{new Date(m.createdAt).toLocaleTimeString()}</span>
                </article>
              );
            })
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
          {showLocationInput || showPatientIdInput ? (
            <div
              className={
                isDoctorMeta ? "composer-meta composer-meta--doctor" : "composer-meta"
              }
            >
              {showLocationInput ? (
                <input
                  className="composer-meta-input"
                  placeholder="Localisation (utile pour les medecins)"
                  value={composer.location}
                  onChange={(e) =>
                    setComposer((prev) => ({ ...prev, location: e.target.value }))
                  }
                />
              ) : null}
              {showPatientIdInput ? (
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
          ) : null}
          {isDoctorMeta ? (
            <p className="composer-meta-hint muted">
              ID patient, OTP et validation du rapport : panneau de droite.
            </p>
          ) : showLocationInput ? (
            <p className="composer-meta-hint muted">
              La localisation aide a proposer des medecins proches et a mieux adapter le triage.
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
