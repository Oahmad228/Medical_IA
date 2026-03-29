import React, { useEffect, useMemo, useState } from "react";
import { filesToDataUrls, patientAssistantMeta } from "../lib/utils";
import TopBar from "../components/TopBar";
import ChatLayout from "../components/ChatLayout";
import PatientStagePanel from "./patient/components/PatientStagePanel";
import PatientAppointmentsModal from "./patient/components/PatientAppointmentsModal";
import PatientSettingsModal from "./patient/components/PatientSettingsModal";
import PatientReportModal from "./patient/components/PatientReportModal";
import { usePatientChat } from "./patient/hooks/usePatientChat";
import { usePatientStatus } from "./patient/hooks/usePatientStatus";
import { usePatientConsult } from "./patient/hooks/usePatientConsult";
import { usePatientAppointments } from "./patient/hooks/usePatientAppointments";
import { usePatientSettings } from "./patient/hooks/usePatientSettings";

// [Module: src/areas/PatientArea.jsx]
// Espace principal patient (chat, suivi, rendez-vous, compte).

// Rend l'interface complete de l'espace patient.
export default function PatientArea({ session, onLogout, onSessionUpdate }) {
  const token = session.token;
  const [appointmentsOpen, setAppointmentsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [lastTriage, setLastTriage] = useState("GREEN");
  const [lastEmotionLevel, setLastEmotionLevel] = useState(null);
  const [patientCoords, setPatientCoords] = useState(null);
  const [autoPickDoctor, setAutoPickDoctor] = useState(null);

  const {
    latestReport,
    latestSymptomReport,
    consultStatus,
    refreshConsultStatus,
    refreshAll,
  } = usePatientStatus({
    token,
    onEmotionLevel: setLastEmotionLevel,
  });

  const {
    conversations,
    selectedConversationId,
    setSelectedConversationId,
    messages,
    setMessages,
    composer,
    setComposer,
    chatSending,
    chatError,
    loadConversation,
    createConversation,
    deleteConversation,
    sendMessage,
  } = usePatientChat({
    token,
    patientId: session.user.patientId,
    onTriageLevel: setLastTriage,
    onEmotionLevel: setLastEmotionLevel,
    onAfterSend: async () => {
      await refreshAll();
    },
  });

  const {
    nearbyDoctors,
    doctorsSearchLoading,
    doctorsSearchError,
    consultRequestLoading,
    consultRequestError,
    searchDoctors,
    requestConsultation,
  } = usePatientConsult({ token });

  const {
    appointments,
    appointmentsLoading,
    appointmentsError,
    appointmentForm,
    setAppointmentForm,
    appointmentActionLoading,
    appointmentActionError,
    refreshAppointments,
    requestAppointment,
    cancelAppointment,
  } = usePatientAppointments({ token });

  const settings = usePatientSettings({ session, token, onLogout, onSessionUpdate });

  useEffect(() => {
    refreshAll().catch(() => {});
    refreshAppointments().catch(() => {});
    const timer = setInterval(() => {
      refreshAll().catch(() => {});
      refreshAppointments().catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [refreshAll, refreshAppointments]);

  const availableDoctors = useMemo(() => {
    const map = new Map();
    const parseCoord = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === "string" && value.trim() === "") return null;
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    };

    const addDoctor = (doc) => {
      if (!doc) return;
      const id = doc.userId ?? doc.id ?? doc.doctorUserId;
      if (!id) return;
      const fullName = doc.fullName || doc.name || `Medecin #${id}`;
      const specialty = doc.specialty || doc.doctorProfile?.specialty || "";
      const yearsExperience =
        typeof doc.yearsExperience === "number"
          ? doc.yearsExperience
          : typeof doc.doctorProfile?.yearsExperience === "number"
          ? doc.doctorProfile.yearsExperience
          : null;
      const clinicLat =
        parseCoord(doc.clinicLat) ?? parseCoord(doc.doctorProfile?.clinicLat);
      const clinicLng =
        parseCoord(doc.clinicLng) ?? parseCoord(doc.doctorProfile?.clinicLng);
      const clinicName = doc.clinicName || doc.doctorProfile?.clinicName || "";
      const clinicAddress =
        doc.clinicAddress || doc.address || doc.doctorProfile?.clinicAddress || "";
      const clinicCity = doc.clinicCity || doc.doctorProfile?.clinicCity || "";
      const distanceKm =
        typeof doc.distanceKm === "number"
          ? doc.distanceKm
          : typeof doc.distance === "number"
          ? doc.distance
          : null;
      map.set(String(id), {
        id: String(id),
        fullName,
        specialty,
        clinicLat,
        clinicLng,
        clinicName,
        clinicAddress,
        clinicCity,
        yearsExperience,
        distanceKm,
        clinicHours: doc.clinicHours || "",
      });
    };

    addDoctor(consultStatus?.doctor);
    if (Array.isArray(nearbyDoctors)) {
      nearbyDoctors.forEach(addDoctor);
    }

    return Array.from(map.values());
  }, [consultStatus?.doctor, nearbyDoctors]);

  useEffect(() => {
    if (appointmentForm.doctorUserId) return;
    const preferredDoctorId = consultStatus?.doctor?.userId;
    if (preferredDoctorId) {
      setAppointmentForm((prev) => ({ ...prev, doctorUserId: String(preferredDoctorId) }));
      return;
    }
    if (availableDoctors.length > 0) {
      setAppointmentForm((prev) => ({ ...prev, doctorUserId: String(availableDoctors[0].id) }));
    }
  }, [appointmentForm.doctorUserId, consultStatus?.doctor?.userId, availableDoctors, setAppointmentForm]);

  const pickBestDoctor = useMemo(() => {
    return (doctors, specialist) => {
      if (!Array.isArray(doctors) || doctors.length === 0) return null;
      const target = String(specialist || "").toLowerCase();
      const scored = doctors.map((doc) => {
        const docSpec = String(doc.specialty || "").toLowerCase();
        const matchesSpec = target && docSpec.includes(target);
        const experience = Number.isFinite(doc.yearsExperience) ? doc.yearsExperience : 0;
        const distance = Number.isFinite(doc.distanceKm) ? doc.distanceKm : null;
        const score =
          (matchesSpec ? 60 : 0) +
          Math.min(experience, 40) * 0.8 +
          (distance !== null ? Math.max(0, 30 - distance) : 0);
        return { doc, score, experience, distance };
      });
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.experience !== a.experience) return b.experience - a.experience;
        if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
        if (a.distance !== null) return -1;
        if (b.distance !== null) return 1;
        return 0;
      });
      return scored[0]?.doc || null;
    };
  }, []);

  useEffect(() => {
    if (!autoPickDoctor || !appointmentsOpen) return;
    if (!Array.isArray(availableDoctors) || availableDoctors.length === 0) return;
    const best = pickBestDoctor(availableDoctors, autoPickDoctor.specialist);
    if (best) {
      setAppointmentForm((prev) => ({ ...prev, doctorUserId: String(best.id) }));
    }
    setAutoPickDoctor(null);
  }, [autoPickDoctor, appointmentsOpen, availableDoctors, pickBestDoctor, setAppointmentForm]);

  const handleConsultationRequest = async ({ location }) => {
    const near = String(location || "").trim();
    const specialist = latestSymptomReport?.specialist || "medecin generaliste";

    if (patientCoords || near) {
      await searchDoctors({
        near,
        specialist,
        lat: patientCoords?.lat,
        lng: patientCoords?.lng,
      });
    }

    await requestConsultation({ location: near });
    await refreshConsultStatus();

    setAutoPickDoctor({ specialist });
    setAppointmentsOpen(true);
  };

  const assistant = patientAssistantMeta(session?.user?.assistantPersona);
  const indicatorLevel = useMemo(() => {
    return String(
      latestSymptomReport?.emotionLevel ||
        lastEmotionLevel ||
        latestSymptomReport?.triageLevel ||
        lastTriage ||
        latestReport?.emotionLevel ||
        latestReport?.triageLevel
    ).toUpperCase();
  }, [lastEmotionLevel, lastTriage, latestReport, latestSymptomReport]);

  const chibiMessage = latestReport?.patientFinalText
    ? "Mon medecin a valide un rapport. Cliquez pour le lire."
    : indicatorLevel === "RED"
    ? "Alerte: consultez en urgence maintenant."
    : indicatorLevel === "ORANGE"
    ? "Vigilance: une consultation rapide est conseillee."
    : "Tout est calme. Continuez la surveillance.";

  const handleOpenSettings = async (view) => {
    setAppointmentsOpen(false);
    setReportOpen(false);
    await settings.openSettings(view);
  };

  const handleOpenAppointments = () => {
    setAppointmentsOpen(true);
    setReportOpen(false);
    settings.closeSettings();
  };

  const handleOpenReport = () => {
    setReportOpen(true);
    setAppointmentsOpen(false);
    settings.closeSettings();
  };

  return (
    <>
      <TopBar
        subtitle="Espace Patient"
        userName={settings.displayName || session.user.fullName}
        onLogout={onLogout}
        showAppointments
        onOpenAppointments={handleOpenAppointments}
        onOpenSettings={handleOpenSettings}
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
            // ignore
          }
        }}
        onRemoveImage={(index) =>
          setComposer((prev) => ({
            ...prev,
            images: prev.images.filter((_item, idx) => idx !== index),
          }))
        }
        stagePanel={
          <PatientStagePanel
            assistant={assistant}
            indicatorLevel={indicatorLevel}
            chibiMessage={chibiMessage}
            latestReport={latestReport}
            latestSymptomReport={latestSymptomReport}
            composer={composer}
            setComposer={setComposer}
            patientCoords={patientCoords}
            setPatientCoords={setPatientCoords}
            consultStatus={consultStatus}
            nearbyDoctors={nearbyDoctors}
            doctorsSearchLoading={doctorsSearchLoading}
            doctorsSearchError={doctorsSearchError}
            consultRequestLoading={consultRequestLoading}
            consultRequestError={consultRequestError}
            onSearchDoctors={({ near, specialist, lat, lng }) => {
              searchDoctors({ near, specialist, lat, lng });
            }}
            onRequestConsultation={async ({ location }) => {
              await handleConsultationRequest({ location });
            }}
            onOpenReport={handleOpenReport}
            onOpenAppointments={handleOpenAppointments}
          />
        }
      />

      <PatientAppointmentsModal
        open={appointmentsOpen}
        onClose={() => setAppointmentsOpen(false)}
        token={token}
        appointmentForm={appointmentForm}
        setAppointmentForm={setAppointmentForm}
        availableDoctors={availableDoctors}
        appointments={appointments}
        appointmentsLoading={appointmentsLoading}
        appointmentsError={appointmentsError}
        appointmentActionLoading={appointmentActionLoading}
        appointmentActionError={appointmentActionError}
        onRequestAppointment={requestAppointment}
        onCancelAppointment={cancelAppointment}
      />

      <PatientSettingsModal
        open={settings.settingsOpen}
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
      />

      <PatientReportModal open={reportOpen} latestReport={latestReport} onClose={() => setReportOpen(false)} />

    </>
  );
}
