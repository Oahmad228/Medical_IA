import { useCallback, useState } from "react";
import { api } from "../../../lib/api";

// [Module: src/areas/patient/hooks/usePatientStatus.js]
// Gere les rapports patient et le statut de consultation.

// Hook de suivi patient (rapports, symptomes, statut).
export function usePatientStatus({ token, onEmotionLevel }) {
  const [latestReport, setLatestReport] = useState(null);
  const [latestSymptomReport, setLatestSymptomReport] = useState(null);
  const [symptomLoading, setSymptomLoading] = useState(false);
  const [consultStatus, setConsultStatus] = useState({ status: "NONE", doctor: null });

  const refreshPatientReport = useCallback(async () => {
    try {
      const data = await api("/patient/reports/latest", { token });
      setLatestReport(data?.report || null);
    } catch (_e) {
      setLatestReport(null);
    }
  }, [token]);

  const refreshLatestSymptom = useCallback(async () => {
    try {
      setSymptomLoading(true);
      const data = await api("/patient/symptom-reports/latest", { token });
      setLatestSymptomReport(data?.report || null);
      if (data?.report?.emotionLevel && typeof onEmotionLevel === "function") {
        onEmotionLevel(data.report.emotionLevel);
      }
    } catch (_e) {
      setLatestSymptomReport(null);
    } finally {
      setSymptomLoading(false);
    }
  }, [onEmotionLevel, token]);

  const refreshConsultStatus = useCallback(async () => {
    try {
      const data = await api("/patient/doctor-link/status", { token });
      setConsultStatus({
        status: data?.status || "NONE",
        doctor: data?.doctor || null,
      });
    } catch (_e) {
      setConsultStatus({ status: "NONE", doctor: null });
    }
  }, [token]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshPatientReport(), refreshLatestSymptom(), refreshConsultStatus()]);
  }, [refreshConsultStatus, refreshLatestSymptom, refreshPatientReport]);

  return {
    latestReport,
    latestSymptomReport,
    symptomLoading,
    consultStatus,
    refreshPatientReport,
    refreshLatestSymptom,
    refreshConsultStatus,
    refreshAll,
  };
}
