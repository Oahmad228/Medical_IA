import React from "react";
import ModalShell from "../../../components/ui/ModalShell";

// [Module: src/areas/patient/components/PatientSettingsModal.jsx]
// Modale des parametres patient.

// Modale des parametres patient.
export default function PatientSettingsModal({
  open,
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
}) {
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
    <ModalShell open={open} onClose={onClose} title={title}>
      {settingsError ? <p className="error-text">{settingsError}</p> : null}
      {settingsInfo ? <p className="info-text">{settingsInfo}</p> : null}

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
          <label htmlFor="profile-fullname">Nom complet</label>
          <input
            id="profile-fullname"
            value={profileForm.fullName}
            onChange={(e) => setProfileForm((prev) => ({ ...prev, fullName: e.target.value }))}
          />

          <label htmlFor="profile-age">Age</label>
          <input
            id="profile-age"
            type="number"
            min="0"
            max="120"
            value={profileForm.age}
            onChange={(e) => setProfileForm((prev) => ({ ...prev, age: e.target.value }))}
          />

          <label htmlFor="profile-sex">Sexe</label>
          <input
            id="profile-sex"
            value={profileForm.sex}
            onChange={(e) => setProfileForm((prev) => ({ ...prev, sex: e.target.value }))}
            placeholder="ex: F, M, Autre"
          />

          <label htmlFor="profile-city">Ville</label>
          <input
            id="profile-city"
            value={profileForm.city}
            onChange={(e) => setProfileForm((prev) => ({ ...prev, city: e.target.value }))}
          />

          <button type="button" disabled={settingsLoading} onClick={onSaveProfile}>
            {settingsLoading ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      ) : null}

      {settingsView === "password" ? (
        <div className="form-stack">
          <label htmlFor="current-password">Mot de passe actuel</label>
          <input
            id="current-password"
            type="password"
            value={passwordForm.currentPassword}
            onChange={(e) =>
              setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))
            }
          />

          <label htmlFor="new-password">Nouveau mot de passe</label>
          <input
            id="new-password"
            type="password"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
          />

          <label htmlFor="confirm-password">Confirmer le mot de passe</label>
          <input
            id="confirm-password"
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
            Cette action est definitive. Toutes vos conversations, rapports et reservations seront supprimes.
          </p>
          <button type="button" className="danger" disabled={settingsLoading} onClick={onDeleteAccount}>
            {settingsLoading ? "Suppression..." : "Supprimer mon compte"}
          </button>
        </div>
      ) : null}
    </ModalShell>
  );
}
