import { useCallback, useState } from "react";
import { api } from "../../../lib/api";

// [Module: src/areas/patient/hooks/usePatientSettings.js]
// Gere le compte patient (profil, mot de passe, suppression).

// Hook de gestion du compte patient.
export function usePatientSettings({ session, token, onLogout, onSessionUpdate }) {
  const [displayName, setDisplayName] = useState(session.user.fullName || "");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsView, setSettingsView] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsInfo, setSettingsInfo] = useState("");
  const [profileForm, setProfileForm] = useState({
    fullName: session.user.fullName || "",
    age: "",
    sex: "",
    city: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const loadAccountProfile = useCallback(async () => {
    const data = await api("/auth/me", { token });
    const user = data?.user || {};
    setProfileForm({
      fullName: user.fullName || "",
      age: user.age ?? "",
      sex: user.sex ?? "",
      city: user.city ?? "",
    });
  }, [token]);

  const openSettings = useCallback(
    async (view) => {
      const nextView = view || "menu";
      setSettingsView(nextView);
      setSettingsOpen(true);
      setSettingsError("");
      setSettingsInfo("");
      if (nextView === "profile") {
        setSettingsLoading(true);
        try {
          await loadAccountProfile();
        } catch (e) {
          setSettingsError(e.message || "Impossible de charger le profil.");
        } finally {
          setSettingsLoading(false);
        }
      }
    },
    [loadAccountProfile]
  );

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    setSettingsView(null);
    setSettingsError("");
    setSettingsInfo("");
  }, []);

  const saveProfile = useCallback(async () => {
    setSettingsError("");
    setSettingsInfo("");
    setSettingsLoading(true);
    try {
      const payload = {
        fullName: profileForm.fullName || undefined,
        age: profileForm.age === "" ? null : Number(profileForm.age),
        sex: profileForm.sex || undefined,
        city: profileForm.city || undefined,
      };
      const data = await api("/auth/me", { method: "PATCH", token, payload });
      if (data?.user?.fullName) setDisplayName(data.user.fullName);
      if (typeof onSessionUpdate === "function") {
        onSessionUpdate({
          ...session,
          token: data?.token || session.token,
          user: { ...session.user, ...data.user },
        });
      }
      setSettingsInfo("Profil mis a jour.");
    } catch (e) {
      setSettingsError(e.message || "Impossible de mettre a jour le profil.");
    } finally {
      setSettingsLoading(false);
    }
  }, [onSessionUpdate, profileForm, session, token]);

  const changePassword = useCallback(async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      setSettingsError("Mot de passe actuel et nouveau requis.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setSettingsError("La confirmation du mot de passe ne correspond pas.");
      return;
    }

    setSettingsError("");
    setSettingsInfo("");
    setSettingsLoading(true);
    try {
      const payload = {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      };
      const data = await api("/auth/me/change-password", { method: "POST", token, payload });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setSettingsInfo(data?.message || "Mot de passe mis a jour.");
    } catch (e) {
      setSettingsError(e.message || "Impossible de changer le mot de passe.");
    } finally {
      setSettingsLoading(false);
    }
  }, [passwordForm, token]);

  const deleteAccount = useCallback(async () => {
    if (!window.confirm("Supprimer votre compte et toutes vos donnees ?")) return;
    setSettingsError("");
    setSettingsInfo("");
    setSettingsLoading(true);
    try {
      await api("/auth/me", { method: "DELETE", token });
      await onLogout();
    } catch (e) {
      setSettingsError(e.message || "Impossible de supprimer le compte.");
    } finally {
      setSettingsLoading(false);
    }
  }, [onLogout, token]);

  return {
    displayName,
    settingsOpen,
    settingsView,
    settingsLoading,
    settingsError,
    settingsInfo,
    profileForm,
    setProfileForm,
    passwordForm,
    setPasswordForm,
    openSettings,
    closeSettings,
    saveProfile,
    changePassword,
    deleteAccount,
  };
}
