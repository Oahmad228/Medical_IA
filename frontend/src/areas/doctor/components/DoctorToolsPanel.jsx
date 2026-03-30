import React, { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import ModalShell from "../../../components/ui/ModalShell";

// [Module: src/areas/doctor/components/DoctorToolsPanel.jsx]
// Panneau latéral medecin (OTP, rendez-vous, rapports).

// Affiche les outils medecin (OTP, rendez-vous, rapport).
export default function DoctorToolsPanel({
  token,
  composer,
  latestDraftReport,
  onRefreshDraft,
  onOpenConversationForPatient,
  onIndicatorChange,
}) {
  const [pairStatus, setPairStatus] = useState("NONE");
  const [pendingLinks, setPendingLinks] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [patientInfo, setPatientInfo] = useState(null);
  const [patientInfoLoading, setPatientInfoLoading] = useState(false);
  const [patientInfoError, setPatientInfoError] = useState("");
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupStep, setLookupStep] = useState("email");
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupOtp, setLookupOtp] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [lookupPatientId, setLookupPatientId] = useState(null);
  const hasActiveLink = String(pairStatus || "").toUpperCase() === "ACTIVE";
  const showEmptyState = !composer.patientId || !hasActiveLink;
  const latestSymptom = Array.isArray(patientInfo?.symptomReports)
    ? patientInfo.symptomReports[0]
    : null;
  const triageLevel = latestSymptom?.triageLevel || latestDraftReport?.triageLevel || "";
  const indicatorLevel = hasActiveLink
    ? String(
        latestSymptom?.emotionLevel ||
          latestSymptom?.triageLevel ||
          latestDraftReport?.triageLevel ||
          ""
      ).toUpperCase()
    : "";
  const indicatorTone = String(indicatorLevel).toLowerCase();
  const showIndicator = ["green", "orange", "red"].includes(indicatorTone);
  const patientDisplayName =
    patientInfo?.fullName ||
    patientInfo?.user?.fullName ||
    (composer.patientId ? `Patient #${composer.patientId}` : "Aucun patient selectionne");
  const patientEmail = patientInfo?.user?.email || "";

  async function resolvePatientName(patientId) {
    const pid = Number(patientId);
    if (!Number.isInteger(pid) || pid <= 0) return `Patient #${patientId}`;
    try {
      const data = await api(`/patients/${pid}/history`, { token });
      return data?.fullName || data?.user?.fullName || `Patient #${pid}`;
    } catch (_e) {
      return `Patient #${pid}`;
    }
  }

  async function openConversationForLookup(patientId) {
    const pid = Number(patientId);
    if (!Number.isInteger(pid) || pid <= 0) return;
    const patientName = await resolvePatientName(pid);
    if (typeof onOpenConversationForPatient === "function") {
      await onOpenConversationForPatient({ patientId: pid, title: patientName });
    }
    setLookupOpen(false);
    setLookupStep("email");
    setLookupOtp("");
    setLookupError("");
  }

  function resetLookup() {
    setLookupOpen(false);
    setLookupStep("email");
    setLookupEmail("");
    setLookupOtp("");
    setLookupError("");
    setLookupPatientId(null);
  }

  async function refreshPairStatus(patientId) {
    try {
      if (!patientId) return setPairStatus("NONE");
      const data = await api(`/doctor/patient-link/status?patientId=${patientId}`, { token });
      setPairStatus(data?.status || "NONE");
    } catch (_e) {
      setPairStatus("NONE");
    }
  }

  async function refreshPatientInfo(patientId) {
    const pid = Number(patientId);
    if (!Number.isInteger(pid) || pid <= 0) {
      setPatientInfo(null);
      return;
    }

    try {
      setPatientInfoLoading(true);
      setPatientInfoError("");
      const data = await api(`/patients/${pid}/history`, { token });
      setPatientInfo(data || null);
    } catch (e) {
      setPatientInfoError(e.message || "Erreur chargement dossier.");
      setPatientInfo(null);
    } finally {
      setPatientInfoLoading(false);
    }
  }

  async function refreshPendingLinks() {
    try {
      setPendingLoading(true);
      const data = await api("/doctor/patient-link/pending", { token });
      setPendingLinks(Array.isArray(data?.links) ? data.links : []);
    } catch (e) {
      setPendingLinks([]);
    } finally {
      setPendingLoading(false);
    }
  }


  useEffect(() => {
    refreshPendingLinks().catch(() => {});
    const timer = setInterval(() => {
      refreshPendingLinks().catch(() => {});
    }, 20000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof onIndicatorChange === "function") {
      onIndicatorChange(indicatorLevel);
    }
  }, [indicatorLevel, onIndicatorChange]);

  useEffect(() => {
    const pid = Number(composer.patientId);
    if (composer.patientId && Number.isInteger(pid) && pid > 0) {
      refreshPairStatus(pid).catch(() => {});
      if (typeof onRefreshDraft === "function") {
        onRefreshDraft(pid).catch(() => {});
      }
      refreshPatientInfo(pid).catch(() => {});
    } else {
      setPatientInfo(null);
    }
  }, [composer.patientId, onRefreshDraft]);

  if (showEmptyState) {
    return (
      <div className="tools-stack tools-stack--empty">
        <button
          type="button"
          className="btn-pill tools-empty__action"
          onClick={() => {
            setLookupEmail("");
            setLookupError("");
            setLookupStep("email");
            setLookupOpen(true);
          }}
        >
          Consulter historique patient
        </button>
        <p className="muted tools-empty__hint">
          Lancez une liaison pour activer le chat et l'historique.
        </p>

        <ModalShell
          open={lookupOpen}
          onClose={resetLookup}
          title={lookupStep === "email" ? "Rechercher un patient" : "Validation OTP"}
        >
          {lookupStep === "email" ? (
            <div className="form-stack">
              <label htmlFor="lookup-email">Email patient</label>
              <input
                id="lookup-email"
                inputMode="email"
                autoComplete="off"
                placeholder="ex: nom@domaine.com"
                value={lookupEmail}
                onChange={(e) => setLookupEmail(e.target.value)}
              />
              <button
                type="button"
                disabled={lookupLoading || !lookupEmail.trim()}
                onClick={async () => {
                  try {
                    setLookupError("");
                    setLookupLoading(true);
                    const email = lookupEmail.trim();
                    const statusData = await api(
                      `/doctor/patient-link/status-by-email?patientEmail=${encodeURIComponent(email)}`,
                      { token }
                    );
                    const pid = statusData?.patientId;
                    if (!pid) {
                      setLookupError("Patient introuvable.");
                      return;
                    }
                    const status = String(statusData?.status || "").toUpperCase();
                    if (status === "ACTIVE") {
                      await openConversationForLookup(pid);
                      return;
                    }

                    const resp = await api("/doctor/patient-link/request-otp-by-email", {
                      method: "POST",
                      token,
                      payload: { patientEmail: email },
                    });
                    setLookupPatientId(resp?.patientId || pid);
                    setLookupStep("otp");
                  } catch (e) {
                    setLookupError(e.message || "Erreur de recherche.");
                  } finally {
                    setLookupLoading(false);
                  }
                }}
              >
                {lookupLoading ? "Recherche..." : "Rechercher"}
              </button>
              {lookupError ? <p className="error-text">{lookupError}</p> : null}
            </div>
          ) : (
            <div className="form-stack">
              <p className="muted">
                Un code OTP a ete envoye au patient. Saisissez-le pour activer la liaison.
              </p>
              <label htmlFor="lookup-otp">Code OTP</label>
              <input
                id="lookup-otp"
                autoComplete="one-time-code"
                placeholder="ex: 123456"
                value={lookupOtp}
                onChange={(e) => setLookupOtp(e.target.value)}
              />
              <div className="button-row">
                <button
                  type="button"
                  className="ghost small"
                  onClick={() => {
                    setLookupError("");
                    setLookupStep("email");
                  }}
                >
                  Modifier l'email
                </button>
                <button
                  type="button"
                  disabled={lookupLoading || !lookupOtp.trim()}
                  onClick={async () => {
                    try {
                      setLookupError("");
                      setLookupLoading(true);
                      const email = lookupEmail.trim();
                      const resp = await api("/doctor/patient-link/confirm-otp-by-email", {
                        method: "POST",
                        token,
                        payload: { patientEmail: email, otp: lookupOtp.trim() },
                      });
                      const pid = resp?.patientId || lookupPatientId;
                      if (!pid) {
                        setLookupError("Patient introuvable.");
                        return;
                      }
                      await openConversationForLookup(pid);
                      setLookupOtp("");
                      setLookupPatientId(null);
                    } catch (e) {
                      setLookupError(e.message || "OTP incorrect.");
                    } finally {
                      setLookupLoading(false);
                    }
                  }}
                >
                  {lookupLoading ? "Validation..." : "Valider le code"}
                </button>
              </div>
              {lookupError ? <p className="error-text">{lookupError}</p> : null}
            </div>
          )}
        </ModalShell>
      </div>
    );
  }

  return (
    <div className="tools-stack">
      <section className="tool-section tool-section--summary">
        <div className="card doctor-summary">
          <div className="section-head">
            <div>
              <p className="kicker">Contexte medecin</p>
              <h3 className="section-head__title">{patientDisplayName}</h3>
              {patientEmail ? <p className="section-head__hint">{patientEmail}</p> : null}
            </div>
            {showIndicator ? (
              <span className={`status-pill status-pill--${indicatorTone}`}>
                {String(indicatorLevel || "").toUpperCase()}
              </span>
            ) : null}
          </div>
          <div className="summary-grid">
            <div>
              <span className="summary-label">Statut liaison</span>
              <strong className="summary-value">{String(pairStatus || "NONE").toUpperCase()}</strong>
            </div>
            <div>
              <span className="summary-label">Demandes en attente</span>
              <strong className="summary-value">
                {pendingLoading ? "..." : pendingLinks.length}
              </strong>
            </div>
          </div>
          {patientInfoLoading ? <p className="muted">Chargement du dossier...</p> : null}
          {patientInfoError ? <p className="error-text">{patientInfoError}</p> : null}
          {latestSymptom ? (
            <div className="status-report">
              <p className="status-report__line">
                <strong>Dernier triage:</strong> {String(latestSymptom.triageLevel || "").toUpperCase()}
              </p>
              {latestSymptom.triageSummary ? (
                <p className="status-report__line">
                  <strong>Synthese:</strong> {latestSymptom.triageSummary}
                </p>
              ) : null}
              {latestSymptom.location ? (
                <p className="status-report__line">
                  <strong>Localisation:</strong> {latestSymptom.location}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
