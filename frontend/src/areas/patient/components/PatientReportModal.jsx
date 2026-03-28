import React from "react";
import ModalShell from "../../../components/ui/ModalShell";

// [Module: src/areas/patient/components/PatientReportModal.jsx]
// Modale d'affichage du rapport patient.

// Modale d'affichage du rapport patient.
export default function PatientReportModal({ open, latestReport, onClose }) {
  if (!open || !latestReport?.patientFinalText) return null;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Rapport valide par votre medecin"
    >
      <div className="muted">
        Niveau de vigilance: {String(latestReport?.triageLevel || "").toUpperCase()}
      </div>
      <div className="output modal-output">{latestReport.patientFinalText}</div>
      <div className="muted">
        Si votre etat s'aggrave, contactez immediatement un service medical d'urgence.
      </div>
    </ModalShell>
  );
}
