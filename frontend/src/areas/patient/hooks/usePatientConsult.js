import { useCallback, useState } from "react";
import { api } from "../../../lib/api";

// [Module: src/areas/patient/hooks/usePatientConsult.js]
// Gere la recherche de medecins et la demande de consultation.

// Hook de consultation et recherche de medecins.
export function usePatientConsult({ token }) {
  const [nearbyDoctors, setNearbyDoctors] = useState([]);
  const [doctorsSearchLoading, setDoctorsSearchLoading] = useState(false);
  const [doctorsSearchError, setDoctorsSearchError] = useState("");
  const [consultRequestError, setConsultRequestError] = useState("");
  const [consultRequestLoading, setConsultRequestLoading] = useState(false);

  const searchDoctors = useCallback(
    async ({ near, specialist, lat, lng }) => {
      setDoctorsSearchError("");
      setNearbyDoctors([]);
      const hasCoords = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
      if (!hasCoords && !near) {
        setDoctorsSearchError("Localisation requise pour rechercher un medecin.");
        return;
      }
      try {
        setDoctorsSearchLoading(true);
        const query = hasCoords
          ? `lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
          : `near=${encodeURIComponent(near)}`;
        const data = await api(
          `/patient/doctors/search?${query}&specialist=${encodeURIComponent(specialist)}`,
          { token }
        );
        setNearbyDoctors(Array.isArray(data?.doctors) ? data.doctors : []);
      } catch (e) {
        setDoctorsSearchError(e.message || "Impossible de rechercher des medecins.");
      } finally {
        setDoctorsSearchLoading(false);
      }
    },
    [token]
  );

  const requestConsultation = useCallback(
    async ({ location }) => {
      setConsultRequestError("");
      try {
        setConsultRequestLoading(true);
        if (!location) {
          setConsultRequestError("Localisation requise pour demander une consultation.");
          return;
        }

        await api("/patient/consultation/request", {
          method: "POST",
          token,
          payload: { location },
        });
      } catch (e) {
        setConsultRequestError(e.message || "Impossible de demander la consultation.");
      } finally {
        setConsultRequestLoading(false);
      }
    },
    [token]
  );

  return {
    nearbyDoctors,
    doctorsSearchLoading,
    doctorsSearchError,
    consultRequestLoading,
    consultRequestError,
    searchDoctors,
    requestConsultation,
    setNearbyDoctors,
  };
}
