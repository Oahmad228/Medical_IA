import React, { useEffect, useRef } from "react";
import ChibiStage from "../../../components/ChibiStage";
import MapboxMap from "../../../components/MapboxMap";

// [Module: src/areas/patient/components/PatientStagePanel.jsx]
// Zone Chibi + demande de consultation.

// Affiche la scene chibi et le bloc consultation.
export default function PatientStagePanel({
  assistant,
  indicatorLevel,
  chibiMessage,
  latestReport,
  latestSymptomReport,
  composer,
  setComposer,
  patientCoords,
  setPatientCoords,
  consultStatus,
  nearbyDoctors,
  doctorsSearchLoading,
  doctorsSearchError,
  consultRequestLoading,
  consultRequestError,
  onSearchDoctors,
  onRequestConsultation,
  onOpenReport,
  onOpenAppointments,
}) {
  const isAlert =
    String(indicatorLevel || "").toUpperCase() === "ORANGE" ||
    String(indicatorLevel || "").toUpperCase() === "RED";
  const rawTone = String(indicatorLevel || "GREEN").toLowerCase();
  const statusTone = ["green", "orange", "red"].includes(rawTone) ? rawTone : "green";
  const hasReport = Boolean(latestReport?.patientFinalText);
  const statusKey = String(indicatorLevel || "GREEN").toUpperCase();
  const appointmentPlanned = ["ACTIVE", "SCHEDULED", "CONFIRMED"].includes(
    String(consultStatus?.status || "").toUpperCase()
  );
  const summaryText = (() => {
    if (statusKey === "RED") return "Signaux critiques detectes. Une prise en charge urgente est necessaire.";
    if (statusKey === "ORANGE") return "Signaux a surveiller. Une consultation rapide est recommandee.";
    return "Etat stable. Aucun signal critique detecte aujourd'hui.";
  })();
  const adviceText = (() => {
    if (statusKey === "RED") return "Conseil: evitez les efforts et contactez un medecin sans delai.";
    if (statusKey === "ORANGE") return "Conseil: reposez-vous, hydratez-vous et notez vos symptomes.";
    return "Conseil: maintenez une bonne hydratation et un sommeil regulier.";
  })();

  const geoRequestedRef = useRef(false);

  useEffect(() => {
    if (!isAlert || patientCoords || geoRequestedRef.current) return;
    geoRequestedRef.current = true;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPatientCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [isAlert, patientCoords, setPatientCoords]);

  const sortedDoctors = Array.isArray(nearbyDoctors)
    ? [...nearbyDoctors].sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0))
    : [];

  const mapMarkers = [
    patientCoords
      ? { id: "patient", lat: patientCoords.lat, lng: patientCoords.lng, color: "#2563eb" }
      : null,
    ...sortedDoctors
      .filter((doc) => Number.isFinite(doc?.clinicLat) && Number.isFinite(doc?.clinicLng))
      .map((doc) => ({
        id: `doc-${doc.userId || doc.id}`,
        lat: Number(doc.clinicLat),
        lng: Number(doc.clinicLng),
        color: "#22c55e",
      })),
  ].filter(Boolean);

  return (
    <div className="patient-stage-stack">
      <ChibiStage
        assistant={assistant}
        indicatorLevel={indicatorLevel}
        message={chibiMessage}
        hasReport={hasReport}
        onOpenReport={onOpenReport}
      />

      <div className="card status-card">
        <div className="section-head">
          <div>
            <p className="kicker">Rapport patient</p>
            <h3 className="section-head__title">Resume clinique</h3>
            <p className="section-head__hint">Synthese du dernier echange et du suivi recent.</p>
          </div>
          <span className={`status-pill status-pill--${statusTone}`}>
            {String(indicatorLevel || "GREEN").toUpperCase()}
          </span>
        </div>
        <div className="status-report">
          <p className="status-report__line">
            <strong>Resume:</strong> {summaryText}
          </p>
          <p className="status-report__line">
            <strong>Conseil:</strong> {adviceText}
          </p>
          {appointmentPlanned ? (
            <p className="status-report__line">
              <strong>Rendez-vous:</strong> planifie.
            </p>
          ) : null}
        </div>
        <div className="status-actions">
          {typeof onOpenAppointments === "function" ? (
            <button type="button" className="ghost small" onClick={onOpenAppointments}>
              Rendez-vous
            </button>
          ) : null}
          {hasReport ? (
            <button type="button" className="ghost small" onClick={onOpenReport}>
              Ouvrir le rapport
            </button>
          ) : null}
        </div>
      </div>

      {isAlert ? (
        <div className="consult-card">
          <h3 className="consult-card__title">Rendez-vous (ORANGE/RED)</h3>
          <p className="consult-card__hint muted">
            Indiquez votre localisation, puis demandez une consultation a un medecin de l&apos;app.
          </p>

          {patientCoords ? (
            <MapboxMap
              center={[patientCoords.lng, patientCoords.lat]}
              markers={mapMarkers}
              zoom={12}
            />
          ) : null}

          <label htmlFor="patient-location">Localisation</label>
          <input
            id="patient-location"
            className="consult-card__input"
            placeholder="ex: Casablanca - Quartier Nord"
            value={composer.location || latestSymptomReport?.location || ""}
            onChange={(e) => setComposer((prev) => ({ ...prev, location: e.target.value }))}
          />

          <div className="consult-actions">
            {!patientCoords ? (
              <button
                type="button"
                className="ghost small"
                onClick={() => {
                  if (!navigator.geolocation) return;
                  navigator.geolocation.getCurrentPosition(
                    (pos) => {
                      setPatientCoords({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                      });
                    },
                    () => {},
                    { enableHighAccuracy: true, timeout: 10000 }
                  );
                }}
              >
                Utiliser ma position
              </button>
            ) : null}
            <button
              type="button"
              className="ghost small"
              disabled={doctorsSearchLoading}
              onClick={() => {
                const near = String(composer.location || latestSymptomReport?.location || "").trim();
                const specialist = latestSymptomReport?.specialist || "medecin generaliste";
                if (patientCoords) {
                  onSearchDoctors({
                    near,
                    specialist,
                    lat: patientCoords.lat,
                    lng: patientCoords.lng,
                  });
                } else {
                  onSearchDoctors({ near, specialist });
                }
              }}
            >
              {doctorsSearchLoading ? "Recherche..." : "Rechercher pres de moi"}
            </button>

            <button
              type="button"
              disabled={consultRequestLoading || consultStatus.status === "ACTIVE"}
              onClick={() => {
                const near = String(composer.location || latestSymptomReport?.location || "").trim();
                onRequestConsultation({ location: near });
              }}
            >
              {consultRequestLoading ? "Demande..." : "Demander une consultation"}
            </button>
          </div>

          {doctorsSearchError ? <p className="error-text">{doctorsSearchError}</p> : null}
          {consultRequestError ? <p className="error-text">{consultRequestError}</p> : null}

          {consultStatus?.status && consultStatus.status !== "NONE" ? (
            <div className="consult-status">
              Statut : <strong>{String(consultStatus.status).toUpperCase()}</strong>
              {consultStatus.doctor?.fullName ? (
                <>
                  {" "}- Medecin: <strong>{consultStatus.doctor.fullName}</strong>
                </>
              ) : null}
            </div>
          ) : null}

          {sortedDoctors.length > 0 ? (
            <div className="nearby-list">
              {sortedDoctors.slice(0, 6).map((d, idx) => (
                <div key={`${d.name}-${idx}`} className="nearby-row">
                  <div className="nearby-row__name">{d.name}</div>
                  <div className="nearby-row__addr">{d.address}</div>
                  {typeof d.distanceKm === "number" ? (
                    <div className="nearby-row__rating">
                      A {d.distanceKm.toFixed(1)} km
                    </div>
                  ) : null}
                  {d.clinicHours ? (
                    <div className="nearby-row__rating">Horaires: {d.clinicHours}</div>
                  ) : null}
                  {typeof d.rating === "number" ? (
                    <div className="nearby-row__rating">Note: {d.rating}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
