import { useCallback, useState } from "react";
import { api } from "../../../lib/api";

// [Module: src/areas/patient/hooks/usePatientAppointments.js]
// Gere les rendez-vous patient.

// Hook de gestion des rendez-vous patient.
export function usePatientAppointments({ token }) {
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

  const refreshAppointments = useCallback(async () => {
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
  }, [token]);

  const requestAppointment = useCallback(async () => {
    const doctorUserId = Number(appointmentForm.doctorUserId || "");
    if (!Number.isInteger(doctorUserId) || doctorUserId <= 0) {
      setAppointmentActionError("Medecin requis.");
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
  }, [appointmentForm.doctorUserId, appointmentForm.note, appointmentForm.scheduledFor, refreshAppointments, token]);

  const cancelAppointment = useCallback(
    async (appointmentId) => {
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
    },
    [appointmentForm.note, refreshAppointments, token]
  );

  return {
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
  };
}
