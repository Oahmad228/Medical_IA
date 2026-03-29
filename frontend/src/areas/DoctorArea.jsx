import React, { useEffect, useState } from "react";
import { filesToDataUrls } from "../lib/utils";
import TopBar from "../components/TopBar";
import ChatLayout from "../components/ChatLayout";
import DoctorToolsPanel from "./doctor/components/DoctorToolsPanel";
import DoctorSettingsModal from "./doctor/components/DoctorSettingsModal";
import DoctorAppointmentsModal from "./doctor/components/DoctorAppointmentsModal";
import ModalShell from "../components/ui/ModalShell";
import { useDoctorChat } from "./doctor/hooks/useDoctorChat";
import { useDoctorSettings } from "./doctor/hooks/useDoctorSettings";
import { useDoctorDraftReport } from "./doctor/hooks/useDoctorDraftReport";

// [Module: src/areas/DoctorArea.jsx]
// Espace principal medecin (chat, outils, compte).

// Rend l'interface complete de l'espace medecin.
export default function DoctorArea({ session, onLogout, onSessionUpdate }) {
  const token = session.token;
  const [appointmentsOpen, setAppointmentsOpen] = useState(false);
  const [reportSentOpen, setReportSentOpen] = useState(false);
  const {
    latestDraftReport,
    draftLoading,
    approveError,
    approveLoading,
    refreshLatestDraft,
    approveDraft,
  } = useDoctorDraftReport({ token });

  const {
    conversations,
    selectedConversationId,
    setSelectedConversationId,
    messages,
    composer,
    setComposer,
    chatSending,
    chatError,
    setChatError,
    loadConversation,
    createConversation,
    openConversationForPatient,
    deleteConversation,
    sendMessage,
  } = useDoctorChat({
    token,
    onAfterSend: async (patientId) => {
      await refreshLatestDraft(patientId);
    },
  });

  const settings = useDoctorSettings({ session, token, onLogout, onSessionUpdate });
  const { checkProfileCompletion, openSettings: openDoctorSettings } = settings;

  const triageTone = String(latestDraftReport?.triageLevel || "").toLowerCase();
  const showTriage = ["green", "orange", "red"].includes(triageTone);
  const shouldInlineDraft =
    Boolean(latestDraftReport?.doctorDraftText) &&
    messages.length === 0 &&
    String(composer.patientId || "").trim();
  const displayMessages = shouldInlineDraft
    ? [
        {
          id: `draft-${latestDraftReport.id}`,
          author: "ASSISTANT",
          content: String(latestDraftReport.doctorDraftText || ""),
          createdAt: latestDraftReport.createdAt || new Date().toISOString(),
        },
      ]
    : messages;

  const chatHeaderActions = latestDraftReport ? (
    <div className="chat-head-actions">
      {showTriage ? (
        <span className={`status-pill status-pill--${triageTone}`}>
          {String(latestDraftReport?.triageLevel || "").toUpperCase()}
        </span>
      ) : null}
      <button
        type="button"
        className="btn-pill"
        disabled={approveLoading}
        onClick={async () => {
          const result = await approveDraft(latestDraftReport.id);
          const pid = Number(composer.patientId);
          if (Number.isInteger(pid) && pid > 0) {
            await refreshLatestDraft(pid);
          }
          if (result?.status === "SENT" || result?.linkClosed) {
            setComposer((prev) => ({ ...prev, patientId: "" }));
            setReportSentOpen(true);
          }
        }}
      >
        {approveLoading ? "Validation..." : "Valider le rapport"}
      </button>
    </div>
  ) : null;

  useEffect(() => {
    const pid = Number(composer.patientId);
    if (composer.patientId && Number.isInteger(pid) && pid > 0) {
      refreshLatestDraft(pid).catch(() => {});
    }
  }, [composer.patientId, refreshLatestDraft]);

  useEffect(() => {
    checkProfileCompletion()
      .then((missing) => {
        if (missing) {
          openDoctorSettings("profile", { force: true });
        }
      })
      .catch(() => {});
  }, [checkProfileCompletion, openDoctorSettings]);

  return (
    <>
      <TopBar
        subtitle="Espace Medecin"
        userName={settings.displayName || session.user.fullName}
        onLogout={onLogout}
        showAppointments
        onOpenAppointments={() => setAppointmentsOpen(true)}
        onOpenSettings={settings.openSettings}
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
        messages={displayMessages}
        chatHeaderActions={chatHeaderActions}
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
          <DoctorToolsPanel
            token={token}
            composer={composer}
            latestDraftReport={latestDraftReport}
            onRefreshDraft={refreshLatestDraft}
            onOpenConversationForPatient={openConversationForPatient}
          />
        }
      />

      <DoctorSettingsModal
        settingsOpen={settings.settingsOpen}
        settingsView={settings.settingsView}
        settingsLoading={settings.settingsLoading}
        settingsError={settings.settingsError}
        settingsInfo={settings.settingsInfo}
        profileForm={settings.profileForm}
        setProfileForm={settings.setProfileForm}
        passwordForm={settings.passwordForm}
        setPasswordForm={settings.setPasswordForm}
        onClose={settings.closeSettings}
        onSelectView={settings.openSettings}
        onSaveProfile={settings.saveProfile}
        onChangePassword={settings.changePassword}
        onDeleteAccount={settings.deleteAccount}
        forceProfile={settings.profileRequired}
      />

      <DoctorAppointmentsModal
        open={appointmentsOpen}
        onClose={() => setAppointmentsOpen(false)}
        token={token}
      />

      <ModalShell
        open={reportSentOpen}
        onClose={() => setReportSentOpen(false)}
        title="Rapport envoye"
      >
        <div className="form-stack">
          <p className="muted">
            Le rapport a ete valide et envoye au patient. La liaison a ete fermee.
          </p>
          <button type="button" onClick={() => setReportSentOpen(false)}>
            Fermer
          </button>
        </div>
      </ModalShell>
    </>
  );
}
