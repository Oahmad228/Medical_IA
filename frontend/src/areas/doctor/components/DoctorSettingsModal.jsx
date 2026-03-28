import React, { useEffect, useState } from "react";
import MapboxMap from "../../../components/MapboxMap";
import ModalShell from "../../../components/ui/ModalShell";

// [Module: src/areas/doctor/components/DoctorSettingsModal.jsx]
// Modale de gestion du compte medecin.

// Modale des parametres medecin.
export default function DoctorSettingsModal({
  settingsOpen,
  settingsView,
  settingsLoading,
  settingsError,
  settingsInfo,
  profileForm,
  setProfileForm,
  passwordForm,
  setPasswordForm,
  onClose,
  onSelectView,
  onSaveProfile,
  onChangePassword,
  onDeleteAccount,
  forceProfile,
}) {
  const [geoError, setGeoError] = useState("");
  const [mapCenter, setMapCenter] = useState(null);
  const clinicLat = Number(profileForm.clinicLat);
  const clinicLng = Number(profileForm.clinicLng);
  const hasClinicCoords = Number.isFinite(clinicLat) && Number.isFinite(clinicLng);

  useEffect(() => {
    if (hasClinicCoords) {
      setMapCenter([clinicLng, clinicLat]);
      return;
    }
    if (mapCenter || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMapCenter([pos.coords.longitude, pos.coords.latitude]);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [clinicLat, clinicLng, hasClinicCoords, mapCenter]);

  const applyClinicCoords = (lat, lng) => {
    setProfileForm((prev) => ({
      ...prev,
      clinicLat: Number(lat).toFixed(6),
      clinicLng: Number(lng).toFixed(6),
    }));
    setMapCenter([lng, lat]);
  };
  const title =
    settingsView === "menu"
      ? "Parametres du compte"
      :
    settingsView === "password"
      ? "Changer le mot de passe"
      : settingsView === "delete"
      ? "Supprimer le compte"
      : "Modifier mes informations";

  return (
    <ModalShell open={settingsOpen} onClose={onClose} title={title} disableClose={forceProfile}>
      {settingsError ? <p className="error-text">{settingsError}</p> : null}
      {settingsInfo ? <p className="info-text">{settingsInfo}</p> : null}
      {forceProfile ? (
        <p className="info-text">Merci de renseigner la localisation et les horaires du cabinet.</p>
      ) : null}

      {settingsView === "menu" ? (
        <div className="form-stack">
          <button type="button" onClick={() => onSelectView("profile")}>
            Modifier mes informations
          </button>
          <button type="button" onClick={() => onSelectView("password")}>
            Changer le mot de passe
          </button>
          <button type="button" className="danger" onClick={() => onSelectView("delete")}>
            Supprimer mon compte
          </button>
        </div>
      ) : null}

      {settingsView === "profile" ? (
        <div className="form-stack">
          <label htmlFor="doctor-fullname">Nom complet</label>
          <input
            id="doctor-fullname"
            value={profileForm.fullName}
            onChange={(e) => setProfileForm((prev) => ({ ...prev, fullName: e.target.value }))}
          />

          <label htmlFor="doctor-specialty">Specialite</label>
          <input
            id="doctor-specialty"
            value={profileForm.specialty}
            onChange={(e) => setProfileForm((prev) => ({ ...prev, specialty: e.target.value }))}
          />

          <label htmlFor="doctor-experience">Annees d'experience</label>
          <input
            id="doctor-experience"
            type="number"
            min="0"
            max="80"
            value={profileForm.yearsExperience}
            onChange={(e) => setProfileForm((prev) => ({ ...prev, yearsExperience: e.target.value }))}
          />

          <label htmlFor="doctor-bio">Bio</label>
          <textarea
            id="doctor-bio"
            rows={3}
            value={profileForm.bio}
            onChange={(e) => setProfileForm((prev) => ({ ...prev, bio: e.target.value }))}
          />

          <label htmlFor="doctor-clinic-name">Cabinet</label>
          <input
            id="doctor-clinic-name"
            value={profileForm.clinicName}
            onChange={(e) => setProfileForm((prev) => ({ ...prev, clinicName: e.target.value }))}
          />

          <label htmlFor="doctor-clinic-address">Adresse</label>
          <input
            id="doctor-clinic-address"
            value={profileForm.clinicAddress}
            onChange={(e) => setProfileForm((prev) => ({ ...prev, clinicAddress: e.target.value }))}
          />

          <label htmlFor="doctor-clinic-city">Ville</label>
          <input
            id="doctor-clinic-city"
            value={profileForm.clinicCity}
            onChange={(e) => setProfileForm((prev) => ({ ...prev, clinicCity: e.target.value }))}
          />

          <label htmlFor="doctor-clinic-hours">Horaires d'ouverture</label>
          <textarea
            id="doctor-clinic-hours"
            rows={3}
            placeholder="ex: Lun-Ven 08:00-18:00; Sam 09:00-13:00"
            value={profileForm.clinicHours}
            onChange={(e) => setProfileForm((prev) => ({ ...prev, clinicHours: e.target.value }))}
          />

          <label>Localisation du cabinet</label>
          <p className="muted doctor-map__hint">Cliquez sur la carte pour choisir l'emplacement.</p>
          {mapCenter ? (
            <MapboxMap
              center={mapCenter}
              markers={
                hasClinicCoords
                  ? [{ id: "clinic", lat: clinicLat, lng: clinicLng, color: "#22c55e" }]
                  : []
              }
              zoom={13}
              selectOnClick
              onSelect={({ lat, lng }) => applyClinicCoords(lat, lng)}
            />
          ) : (
            <div className="doctor-map__empty muted">Activez la geolocalisation pour afficher la carte.</div>
          )}
          <div className="clinic-coords">
            <span>Latitude: {profileForm.clinicLat || "-"}</span>
            <span>Longitude: {profileForm.clinicLng || "-"}</span>
          </div>

          <button
            type="button"
            className="ghost small"
            onClick={() => {
              setGeoError("");
              if (!navigator.geolocation) {
                setGeoError("Geolocalisation indisponible sur ce navigateur.");
                return;
              }
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  applyClinicCoords(pos.coords.latitude, pos.coords.longitude);
                },
                () => {
                  setGeoError("Impossible d'obtenir la position.");
                },
                { enableHighAccuracy: true, timeout: 10000 }
              );
            }}
          >
            Utiliser ma position
          </button>
          {geoError ? <p className="error-text">{geoError}</p> : null}

          <button type="button" disabled={settingsLoading} onClick={onSaveProfile}>
            {settingsLoading ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      ) : null}

      {settingsView === "password" ? (
        <div className="form-stack">
          <label htmlFor="doctor-current-password">Mot de passe actuel</label>
          <input
            id="doctor-current-password"
            type="password"
            value={passwordForm.currentPassword}
            onChange={(e) =>
              setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))
            }
          />

          <label htmlFor="doctor-new-password">Nouveau mot de passe</label>
          <input
            id="doctor-new-password"
            type="password"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
          />

          <label htmlFor="doctor-confirm-password">Confirmer le mot de passe</label>
          <input
            id="doctor-confirm-password"
            type="password"
            value={passwordForm.confirmPassword}
            onChange={(e) =>
              setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
            }
          />

          <button type="button" disabled={settingsLoading} onClick={onChangePassword}>
            {settingsLoading ? "Mise a jour..." : "Mettre a jour"}
          </button>
        </div>
      ) : null}

      {settingsView === "delete" ? (
        <div className="form-stack">
          <p className="muted">
            Cette action est definitive. Tous vos rapports et reservations seront supprimes.
          </p>
          <button type="button" className="danger" disabled={settingsLoading} onClick={onDeleteAccount}>
            {settingsLoading ? "Suppression..." : "Supprimer mon compte"}
          </button>
        </div>
      ) : null}
    </ModalShell>
  );
}
