import React, { useEffect, useMemo, useState } from "react";
import { APPOINTMENT_STATUS_LABELS } from "../../shared/appointmentLabels";
import ModalShell from "../../../components/ui/ModalShell";
import MapboxMap from "../../../components/MapboxMap";
import { api } from "../../../lib/api";

// [Module: src/areas/patient/components/PatientAppointmentsModal.jsx]
// Modale des rendez-vous patient.

// Modale de gestion des rendez-vous patient.
export default function PatientAppointmentsModal({
  open,
  onClose,
  token,
  appointmentForm,
  setAppointmentForm,
  availableDoctors,
  appointments,
  appointmentsLoading,
  appointmentsError,
  appointmentActionLoading,
  appointmentActionError,
  onRequestAppointment,
  onCancelAppointment,
}) {
  const [doctorQuery, setDoctorQuery] = useState("");
  const [doctorSort, setDoctorSort] = useState("distance");
  const [doctorSuggestions, setDoctorSuggestions] = useState([]);
  const [doctorSuggestionsLoading, setDoctorSuggestionsLoading] = useState(false);
  const [doctorSuggestionsError, setDoctorSuggestionsError] = useState("");
  const [patientCoords, setPatientCoords] = useState(null);
  const [patientGeoError, setPatientGeoError] = useState("");
  const normalizedQuery = doctorQuery.trim().toLowerCase();

  useEffect(() => {
    if (!open || !navigator.geolocation) return;
    let watchId = null;
    setPatientGeoError("");
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPatientCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        setPatientGeoError("Impossible d'obtenir la position en direct.");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const query = doctorQuery.trim();
    if (query.length < 2) {
      setDoctorSuggestions([]);
      setDoctorSuggestionsError("");
      setDoctorSuggestionsLoading(false);
      return;
    }

    let isActive = true;
    setDoctorSuggestionsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await api(`/patient/doctors/suggest?query=${encodeURIComponent(query)}`,
          { token }
        );
        if (!isActive) return;
        const doctors = Array.isArray(data?.doctors) ? data.doctors : [];
        const normalized = doctors
          .map((doc) => {
            const id = doc.userId ?? doc.id;
            if (!id) return null;
            return {
              id: String(id),
              fullName: doc.fullName || doc.name || `Medecin #${id}`,
              specialty: doc.specialty || doc.doctorProfile?.specialty || "",
              clinicLat: typeof doc.clinicLat === "number" ? doc.clinicLat : null,
              clinicLng: typeof doc.clinicLng === "number" ? doc.clinicLng : null,
              clinicName: doc.clinicName || "",
              clinicAddress: doc.clinicAddress || "",
              clinicCity: doc.clinicCity || "",
              distanceKm: typeof doc.distanceKm === "number" ? doc.distanceKm : null,
              clinicHours: doc.clinicHours || "",
            };
          })
          .filter(Boolean);

        setDoctorSuggestions(normalized);
        setDoctorSuggestionsError("");
      } catch (e) {
        if (!isActive) return;
        setDoctorSuggestions([]);
        setDoctorSuggestionsError(e.message || "Recherche impossible.");
      } finally {
        if (isActive) setDoctorSuggestionsLoading(false);
      }
    }, 250);

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [doctorQuery, open, token]);

  const doctorCandidates = useMemo(() => {
    const map = new Map();
    const addDoctor = (doc) => {
      if (!doc?.id) return;
      map.set(String(doc.id), doc);
    };

    if (Array.isArray(availableDoctors)) availableDoctors.forEach(addDoctor);
    if (Array.isArray(doctorSuggestions)) doctorSuggestions.forEach(addDoctor);

    return Array.from(map.values());
  }, [availableDoctors, doctorSuggestions]);

  const filteredDoctors = useMemo(() => {
    if (!Array.isArray(doctorCandidates)) return [];
    const filtered = normalizedQuery
      ? doctorCandidates.filter((doc) => {
          const haystack = `${doc.fullName || ""} ${doc.specialty || ""}`.toLowerCase();
          return haystack.includes(normalizedQuery);
        })
      : [...doctorCandidates];

    const hasDistance = filtered.some((doc) => Number.isFinite(doc?.distanceKm));
    const sortMode = doctorSort === "distance" && hasDistance ? "distance" : "name";
    return filtered.sort((a, b) => {
      if (sortMode === "distance") {
        const aDist = Number.isFinite(a?.distanceKm) ? a.distanceKm : Number.POSITIVE_INFINITY;
        const bDist = Number.isFinite(b?.distanceKm) ? b.distanceKm : Number.POSITIVE_INFINITY;
        return aDist - bDist;
      }
      const aName = String(a?.fullName || "").toLowerCase();
      const bName = String(b?.fullName || "").toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [doctorCandidates, normalizedQuery, doctorSort]);

  const parseCoord = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const selectedDoctor = Array.isArray(doctorCandidates)
    ? doctorCandidates.find((doc) => String(doc.id) === String(appointmentForm.doctorUserId))
    : null;
  const doctorLat = parseCoord(selectedDoctor?.clinicLat);
  const doctorLng = parseCoord(selectedDoctor?.clinicLng);
  const hasDoctorCoords =
    Number.isFinite(doctorLat) &&
    Number.isFinite(doctorLng) &&
    Math.abs(doctorLat) <= 90 &&
    Math.abs(doctorLng) <= 180;
  const hasPatientCoords =
    Number.isFinite(patientCoords?.lat) &&
    Number.isFinite(patientCoords?.lng) &&
    Math.abs(patientCoords.lat) <= 90 &&
    Math.abs(patientCoords.lng) <= 180;
  const mapCenter = useMemo(() => {
    if (hasDoctorCoords && hasPatientCoords) {
      return [(doctorLng + patientCoords.lng) / 2, (doctorLat + patientCoords.lat) / 2];
    }
    if (hasDoctorCoords) return [doctorLng, doctorLat];
    if (hasPatientCoords) return [patientCoords.lng, patientCoords.lat];
    return null;
  }, [doctorLat, doctorLng, hasDoctorCoords, hasPatientCoords, patientCoords]);
  const mapMarkers = useMemo(
    () =>
      [
        hasDoctorCoords
          ? { id: "doctor", lat: doctorLat, lng: doctorLng, color: "#22c55e" }
          : null,
        hasPatientCoords
          ? { id: "patient", lat: patientCoords.lat, lng: patientCoords.lng, color: "#2563eb" }
          : null,
      ].filter(Boolean),
    [doctorLat, doctorLng, hasDoctorCoords, hasPatientCoords, patientCoords]
  );
  const doctorAddress = [
    selectedDoctor?.clinicName,
    selectedDoctor?.clinicAddress,
    selectedDoctor?.clinicCity,
  ]
    .filter(Boolean)
    .join(" · ");

  const applyDoctorSelection = (doc) => {
    if (!doc) return;
    setAppointmentForm((prev) => ({ ...prev, doctorUserId: String(doc.id) }));
    setDoctorQuery(doc.fullName || "");
  };

  return (
    <ModalShell open={open} onClose={onClose} title="Fil des reservations" wide>
      <div className="appointment-thread">
        <div className="appointment-thread__form">
          <h4>Nouvelle demande</h4>
          <label htmlFor="appointment-doctor-id">Medecin</label>
          <div className="appointment-doctor">
            <input
              id="appointment-doctor-id"
              type="search"
              placeholder="Nom et prenom du medecin"
              value={doctorQuery}
              onChange={(e) => {
                setDoctorQuery(e.target.value);
                setAppointmentForm((prev) => ({ ...prev, doctorUserId: "" }));
              }}
            />
            <div className="appointment-doctor__filters">
              <label htmlFor="appointment-doctor-sort" className="sr-only">
                Trier les medecins
              </label>
              <select
                id="appointment-doctor-sort"
                value={doctorSort}
                onChange={(e) => setDoctorSort(e.target.value)}
              >
                <option value="distance">Proximite</option>
                <option value="name">Nom</option>
              </select>
            </div>
            {filteredDoctors.length > 0 ? (
              <div className="appointment-doctor__list" role="listbox">
                {filteredDoctors.slice(0, 6).map((doc) => {
                  const metaParts = [];
                  if (doc.specialty) metaParts.push(doc.specialty);
                  if (Number.isFinite(doc.distanceKm)) {
                    metaParts.push(`${doc.distanceKm.toFixed(1)} km`);
                  }
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      className={
                        String(doc.id) === String(appointmentForm.doctorUserId)
                          ? "appointment-doctor__item appointment-doctor__item--active"
                          : "appointment-doctor__item"
                      }
                      onClick={() => applyDoctorSelection(doc)}
                    >
                      <span>{doc.fullName}</span>
                      {metaParts.length > 0 ? (
                        <span className="appointment-doctor__meta">{metaParts.join(" · ")}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {!doctorSuggestionsLoading && doctorSuggestionsError ? (
              <p className="error-text">{doctorSuggestionsError}</p>
            ) : null}
            {doctorSuggestionsLoading ? <p className="muted">Recherche...</p> : null}
          </div>
          {selectedDoctor ? (
            <p className="muted">
              Medecin selectionne: {selectedDoctor.fullName}
              {selectedDoctor.specialty ? ` (${selectedDoctor.specialty})` : ""}
            </p>
          ) : null}

          <div className="appointment-map">
            <p className="muted appointment-map__hint">
              Carte du cabinet (vert) et votre localisation en direct (bleu).
            </p>
            {mapCenter ? (
              <MapboxMap
                center={mapCenter}
                markers={mapMarkers}
                zoom={12}
                showLocate
                onLocate={({ lat, lng }) => setPatientCoords({ lat, lng })}
              />
            ) : (
              <p className="muted">Activez la geolocalisation pour afficher la carte.</p>
            )}
            {doctorAddress ? (
              <p className="appointment-map__meta">Cabinet: {doctorAddress}</p>
            ) : null}
            {patientGeoError ? <p className="error-text">{patientGeoError}</p> : null}
          </div>

          <label htmlFor="appointment-time">Date/heure souhaitee</label>
          <input
            id="appointment-time"
            type="datetime-local"
            value={appointmentForm.scheduledFor}
            onChange={(e) =>
              setAppointmentForm((prev) => ({ ...prev, scheduledFor: e.target.value }))
            }
          />

          <label htmlFor="appointment-note">Note (optionnel)</label>
          <textarea
            id="appointment-note"
            rows={3}
            value={appointmentForm.note}
            onChange={(e) => setAppointmentForm((prev) => ({ ...prev, note: e.target.value }))}
            placeholder="Motif, contraintes horaires, etc."
          />

          <button type="button" disabled={appointmentActionLoading} onClick={onRequestAppointment}>
            {appointmentActionLoading ? "Envoi..." : "Demander un rendez-vous"}
          </button>

          {appointmentActionError ? <p className="error-text">{appointmentActionError}</p> : null}
          {appointmentsError ? <p className="error-text">{appointmentsError}</p> : null}
        </div>

        <div className="appointment-thread__list">
          <h4>Historique</h4>
          {appointmentsLoading ? <p className="muted">Chargement...</p> : null}
          {appointments.length === 0 && !appointmentsLoading ? (
            <p className="muted">Aucune reservation pour le moment.</p>
          ) : null}

          <div className="appointment-list">
            {appointments.map((appt) => {
              const status = String(appt.status || "");
              const statusLabel = APPOINTMENT_STATUS_LABELS[status] || status;
              return (
                <div key={appt.id} className="appointment-item">
                  <div className="appointment-row">
                    <div className={`appointment-badge appointment-badge--${status.toLowerCase()}`}>
                      {statusLabel}
                    </div>
                    <span className="muted">#{appt.id}</span>
                  </div>
                  <p className="muted">
                    Medecin: {appt.doctor?.fullName || "N/A"}
                    {appt.doctor?.specialty ? ` (${appt.doctor.specialty})` : ""}
                  </p>
                  <p className="muted">
                    Date: {appt.scheduledFor ? new Date(appt.scheduledFor).toLocaleString() : "A definir"}
                  </p>
                  {appt.doctorNote ? <p className="muted">Note medecin: {appt.doctorNote}</p> : null}
                  {appt.status !== "CANCELED" && appt.status !== "REJECTED" ? (
                    <button
                      type="button"
                      className="ghost small"
                      disabled={appointmentActionLoading}
                      onClick={() => onCancelAppointment(appt.id)}
                    >
                      Annuler
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
