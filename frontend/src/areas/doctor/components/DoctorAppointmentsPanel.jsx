import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../lib/api";
import { APPOINTMENT_STATUS_LABELS } from "../../shared/appointmentLabels";

// [Module: src/areas/doctor/components/DoctorAppointmentsPanel.jsx]
// Section rendez-vous medecin.

// Affiche et met a jour les rendez-vous en tant que medecin.
export default function DoctorAppointmentsPanel({ token, onClose }) {
  const [appointments, setAppointments] = useState([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState("");
  const [appointmentActionLoading, setAppointmentActionLoading] = useState(false);
  const [appointmentActionError, setAppointmentActionError] = useState("");
  const [selectedAppointmentId, setSelectedAppointmentId] = useState(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleForm, setRescheduleForm] = useState({ scheduledFor: "", note: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [activeView, setActiveView] = useState("list");
  const searchInputRef = useRef(null);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredAppointments = useMemo(() => {
    return appointments.filter((appointment) => {
      const patientName = String(appointment?.patient?.fullName || "").toLowerCase();
      const status = String(appointment?.status || "");
      const matchesSearch = !normalizedSearch || patientName.includes(normalizedSearch);
      const matchesStatus = statusFilter === "ALL" || status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [appointments, normalizedSearch, statusFilter]);

  async function refreshAppointments() {
    try {
      setAppointmentsLoading(true);
      setAppointmentsError("");
      const data = await api("/doctor/appointments", { token });
      setAppointments(Array.isArray(data?.appointments) ? data.appointments : []);
    } catch (e) {
      setAppointmentsError(e.message || "Erreur chargement reservations.");
      setAppointments([]);
    } finally {
      setAppointmentsLoading(false);
    }
  }

  function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString();
  }

  function formatDateInput(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (num) => String(num).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}`;
  }

  async function handleAppointmentAction(appointmentId, action, overrides = {}) {
    if (action === "reschedule" && !String(overrides.scheduledFor || "").trim()) {
      setAppointmentActionError("Date/heure requise pour replanifier.");
      return;
    }

    try {
      setAppointmentActionLoading(true);
      setAppointmentActionError("");
      const payload = {};
      if (String(overrides.note || "").trim()) payload.note = String(overrides.note || "").trim();
      if (String(overrides.scheduledFor || "").trim()) {
        payload.scheduledFor = String(overrides.scheduledFor || "").trim();
      }
      await api(`/doctor/appointments/${appointmentId}/${action}`, {
        method: "POST",
        token,
        payload,
      });
      await refreshAppointments();
    } catch (e) {
      setAppointmentActionError(e.message || "Erreur mise a jour reservation.");
    } finally {
      setAppointmentActionLoading(false);
    }
  }

  useEffect(() => {
    refreshAppointments().catch(() => {});
    const timer = setInterval(() => {
      refreshAppointments().catch(() => {});
    }, 20000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedAppointmentId && filteredAppointments.length > 0) {
      setSelectedAppointmentId(filteredAppointments[0].id);
    }
    if (
      selectedAppointmentId &&
      filteredAppointments.length > 0 &&
      !filteredAppointments.some(
        (appointment) => String(appointment.id) === String(selectedAppointmentId)
      )
    ) {
      setSelectedAppointmentId(filteredAppointments[0].id);
    }
    if (filteredAppointments.length === 0) {
      setActiveView("list");
    }
  }, [filteredAppointments, selectedAppointmentId]);

  const selectedAppointment = filteredAppointments.find(
    (appointment) => String(appointment.id) === String(selectedAppointmentId)
  );

  return (
    <section className="tool-section">
      {appointmentsError ? <p className="error-text">{appointmentsError}</p> : null}
      {appointmentActionError ? <p className="error-text">{appointmentActionError}</p> : null}
      {appointmentsLoading ? <p className="muted">Chargement des rendez-vous...</p> : null}

      {!appointmentsLoading && appointments.length === 0 ? (
        <p className="muted">Aucune reservation en attente.</p>
      ) : null}

      {appointments.length > 0 ? (
        <div className="appointment-thread appointment-thread--doctor appointment-thread--single">
          {activeView === "list" ? (
            <div className="appointment-thread__list appointment-thread__list-only">
              <div className="appointment-thread__list-head">
                <div className="appointment-thread__title">
                  <h4>Demandes</h4>
                  <div className="appointment-thread__actions">
                    <button
                      type="button"
                      className="appointment-search-toggle"
                      title="Rechercher"
                      onClick={() => searchInputRef.current?.focus()}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
                        <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.6" />
                      </svg>
                    </button>
                    {typeof onClose === "function" ? (
                      <button type="button" className="ghost small" onClick={onClose}>
                        Fermer
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="appointment-thread__filters">
                  <label htmlFor="appointment-search" className="sr-only">
                    Rechercher un patient
                  </label>
                  <input
                    id="appointment-search"
                    ref={searchInputRef}
                    type="search"
                    placeholder="Nom ou prenom"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                  <label htmlFor="appointment-status" className="sr-only">
                    Filtrer par statut
                  </label>
                  <select
                    id="appointment-status"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                  >
                    <option value="ALL">Tous les statuts</option>
                    {Object.entries(APPOINTMENT_STATUS_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="appointment-chat-list">
                {filteredAppointments.map((appointment) => {
                  const patient = appointment?.patient || {};
                  const status = String(appointment?.status || "");
                  const statusLabel = APPOINTMENT_STATUS_LABELS[status] || status || "-";
                  return (
                    <button
                      key={appointment.id}
                      type="button"
                      className="appointment-chat-item"
                      onClick={() => {
                        setSelectedAppointmentId(appointment.id);
                        setActiveView("detail");
                      }}
                    >
                      <div className="appointment-chat-item__title">
                        {patient.fullName || "Patient"}
                      </div>
                      <div className="appointment-chat-item__meta">
                        {statusLabel}
                        {appointment.requestedAt
                          ? ` · ${formatDateTime(appointment.requestedAt)}`
                          : ""}
                      </div>
                    </button>
                  );
                })}
                {!filteredAppointments.length ? (
                  <p className="muted">Aucune demande pour ce filtre.</p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="appointment-thread__detail appointment-thread__detail-only">
              <div className="appointment-detail-head appointment-detail-head--stacked">
                <div className="appointment-thread__actions">
                  <button
                    type="button"
                    className="appointment-back"
                    onClick={() => setActiveView("list")}
                  >
                    Retour aux demandes
                  </button>
                  {typeof onClose === "function" ? (
                    <button type="button" className="ghost small" onClick={onClose}>
                      Fermer
                    </button>
                  ) : null}
                </div>
              </div>
              {selectedAppointment ? (() => {
              const appointment = selectedAppointment;
              const status = String(appointment?.status || "");
              const patient = appointment?.patient || {};
              const statusLabel = APPOINTMENT_STATUS_LABELS[status] || status || "-";
              const canAccept = status === "REQUESTED" || status === "RESCHEDULED";
              const canReject = status === "REQUESTED";
              const canReschedule = !["REJECTED", "CANCELED"].includes(status);
              const canCancel = !["REJECTED", "CANCELED"].includes(status);
              const infoText = `Email: ${patient.email || "N/A"}\nDemande: ${
                appointment.requestedAt ? formatDateTime(appointment.requestedAt) : "N/A"
              }\nID: ${appointment.id}`;

              return (
                  <div className="appointment-detail">
                    <div className="appointment-detail-head">
                      <div>
                        <h4>{patient.fullName || "Patient"}</h4>
                        <p className="muted">
                          Statut: <strong>{statusLabel}</strong>
                        </p>
                      </div>
                      <button type="button" className="appointment-info" title={infoText}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
                          <path d="M12 11v6" stroke="currentColor" strokeWidth="1.6" />
                          <circle cx="12" cy="8" r="1" fill="currentColor" />
                        </svg>
                      </button>
                    </div>

                    <div className="appointment-detail-body">
                      <p className="muted">
                        Date proposee: {appointment.scheduledFor ? formatDateTime(appointment.scheduledFor) : "A definir"}
                      </p>
                      <p className="muted">
                        Raison du rendez-vous: {appointment.patientNote || "Aucune note."}
                      </p>
                      <p className="muted">
                        Message au patient: {appointment.doctorNote || "Aucun message."}
                      </p>
                    </div>

                    <div className="appointment-actions">
                      {canAccept ? (
                        <button
                          type="button"
                          className="ghost small"
                          disabled={appointmentActionLoading}
                          onClick={() => handleAppointmentAction(appointment.id, "accept")}
                        >
                          Accepter
                        </button>
                      ) : null}
                      {canReject ? (
                        <button
                          type="button"
                          className="ghost small"
                          disabled={appointmentActionLoading}
                          onClick={() => handleAppointmentAction(appointment.id, "reject")}
                        >
                          Refuser
                        </button>
                      ) : null}
                      {canReschedule ? (
                        <button
                          type="button"
                          className="ghost small"
                          disabled={appointmentActionLoading}
                          onClick={() => {
                            setRescheduleForm({
                              scheduledFor: formatDateInput(appointment.scheduledFor),
                              note: "",
                            });
                            setRescheduleOpen(true);
                          }}
                        >
                          Replanifier
                        </button>
                      ) : null}
                      {canCancel ? (
                        <button
                          type="button"
                          className="ghost small"
                          disabled={appointmentActionLoading}
                          onClick={() => handleAppointmentAction(appointment.id, "cancel")}
                        >
                          Annuler
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
            })() : (
                <p className="muted">Selectionnez une demande.</p>
              )}
            </div>
          )}
        </div>
      ) : null}

      {rescheduleOpen && selectedAppointment ? (
        <div className="appointment-reschedule">
          <div className="appointment-reschedule__card">
            <h4>Replanifier le rendez-vous</h4>
            <label htmlFor="reschedule-time">Nouvelle date/heure</label>
            <input
              id="reschedule-time"
              type="datetime-local"
              value={rescheduleForm.scheduledFor}
              onChange={(e) =>
                setRescheduleForm((prev) => ({ ...prev, scheduledFor: e.target.value }))
              }
            />

            <label htmlFor="reschedule-note">Message au patient</label>
            <textarea
              id="reschedule-note"
              rows={3}
              placeholder="Raison de replanification"
              value={rescheduleForm.note}
              onChange={(e) => setRescheduleForm((prev) => ({ ...prev, note: e.target.value }))}
            />

            <div className="appointment-reschedule__actions">
              <button type="button" className="ghost small" onClick={() => setRescheduleOpen(false)}>
                Annuler
              </button>
              <button
                type="button"
                disabled={appointmentActionLoading}
                onClick={async () => {
                  await handleAppointmentAction(selectedAppointment.id, "reschedule", rescheduleForm);
                  setRescheduleOpen(false);
                  setRescheduleForm({ scheduledFor: "", note: "" });
                }}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
