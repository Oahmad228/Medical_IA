import { useCallback, useState } from "react";
import { api } from "../../../lib/api";

// [Module: src/areas/doctor/hooks/useDoctorSettings.js]
// Gere les modales et formulaires de compte medecin.

// Hook de gestion du compte medecin.
export function useDoctorSettings({ session, token, onLogout, onSessionUpdate }) {
  const [displayName, setDisplayName] = useState(session.user.fullName || "");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsView, setSettingsView] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsInfo, setSettingsInfo] = useState("");
  const [profileRequired, setProfileRequired] = useState(false);
  const [profileForm, setProfileForm] = useState({
    fullName: session.user.fullName || "",
    specialty: "",
    yearsExperience: "",
    bio: "",
    clinicName: "",
    clinicAddress: "",
    clinicCity: "",
    clinicLat: "",
    clinicLng: "",
    clinicHours: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const loadAccountProfile = useCallback(async () => {
    const data = await api("/auth/me", { token });
    const user = data?.user || {};
    const doctorProfile = user.doctorProfile || {};
    setProfileForm({
      fullName: user.fullName || "",
      specialty: doctorProfile.specialty || "",
      yearsExperience: doctorProfile.yearsExperience ?? "",
      bio: doctorProfile.bio ?? "",
      clinicName: doctorProfile.clinicName ?? "",
      clinicAddress: doctorProfile.clinicAddress ?? "",
      clinicCity: doctorProfile.clinicCity ?? "",
      clinicLat: doctorProfile.clinicLat ?? "",
      clinicLng: doctorProfile.clinicLng ?? "",
      clinicHours: doctorProfile.clinicHours ?? "",
    });
    const missing =
      !doctorProfile?.clinicLat ||
      !doctorProfile?.clinicLng ||
      !String(doctorProfile?.clinicHours || "").trim();
    setProfileRequired(Boolean(missing));
  }, [token]);

  const checkProfileCompletion = useCallback(async () => {
    const data = await api("/auth/me", { token });
    const doctorProfile = data?.user?.doctorProfile || {};
    const missing =
      !doctorProfile?.clinicLat ||
      !doctorProfile?.clinicLng ||
      !String(doctorProfile?.clinicHours || "").trim();
    setProfileRequired(Boolean(missing));
    return Boolean(missing);
  }, [token]);

  const openSettings = useCallback(
    async (view, options = {}) => {
      const nextView = view || "menu";
      setSettingsView(nextView);
      setSettingsOpen(true);
      setSettingsError("");
      setSettingsInfo("");
      if (options.force) {
        setProfileRequired(true);
      }
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
    if (profileRequired) return;
    setSettingsOpen(false);
    setSettingsView(null);
    setSettingsError("");
    setSettingsInfo("");
  }, [profileRequired]);

  const saveProfile = useCallback(async () => {
    setSettingsError("");
    setSettingsInfo("");
    setSettingsLoading(true);
    try {
      const payload = {
        fullName: profileForm.fullName || undefined,
        specialty: profileForm.specialty || undefined,
        yearsExperience: profileForm.yearsExperience === "" ? null : Number(profileForm.yearsExperience),
        bio: profileForm.bio || undefined,
        clinicName: profileForm.clinicName || undefined,
        clinicAddress: profileForm.clinicAddress || undefined,
        clinicCity: profileForm.clinicCity || undefined,
        clinicLat: profileForm.clinicLat === "" ? null : Number(profileForm.clinicLat),
        clinicLng: profileForm.clinicLng === "" ? null : Number(profileForm.clinicLng),
        clinicHours: profileForm.clinicHours || undefined,
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
      const missing =
        !payload.clinicLat ||
        !payload.clinicLng ||
        !String(payload.clinicHours || "").trim();
      setProfileRequired(Boolean(missing));
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
    setDisplayName,
    settingsOpen,
    settingsView,
    settingsLoading,
    settingsError,
    settingsInfo,
    profileRequired,
    profileForm,
    setProfileForm,
    passwordForm,
    setPasswordForm,
    openSettings,
    closeSettings,
    checkProfileCompletion,
    saveProfile,
    changePassword,
    deleteAccount,
  };
}
