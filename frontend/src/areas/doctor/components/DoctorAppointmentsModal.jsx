import React from "react";
import ModalShell from "../../../components/ui/ModalShell";
import DoctorAppointmentsPanel from "./DoctorAppointmentsPanel";

export default function DoctorAppointmentsModal({ open, onClose, token }) {
  return (
    <ModalShell open={open} onClose={onClose} title="Rendez-vous">
      <DoctorAppointmentsPanel token={token} />
    </ModalShell>
  );
}
