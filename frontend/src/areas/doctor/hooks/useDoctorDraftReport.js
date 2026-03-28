import { useCallback, useState } from "react";
import { api } from "../../../lib/api";

// [Module: src/areas/doctor/hooks/useDoctorDraftReport.js]
// Gere le dernier brouillon et la validation des rapports.

// Hook de gestion des rapports brouillons.
export function useDoctorDraftReport({ token }) {
  const [latestDraftReport, setLatestDraftReport] = useState(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [approveError, setApproveError] = useState("");
  const [approveLoading, setApproveLoading] = useState(false);

  const refreshLatestDraft = useCallback(
    async (patientIdValue) => {
      try {
        setApproveError("");
        setDraftLoading(true);
        if (!patientIdValue) {
          setLatestDraftReport(null);
          return;
        }
        const data = await api(`/doctor/reports/latest?patientId=${patientIdValue}`, { token });
        setLatestDraftReport(data?.report || null);
      } catch (_e) {
        setLatestDraftReport(null);
      } finally {
        setDraftLoading(false);
      }
    },
    [token]
  );

  const approveDraft = useCallback(
    async (reportId) => {
      try {
        setApproveLoading(true);
        setApproveError("");
        await api(`/doctor/reports/${reportId}/approve`, {
          method: "POST",
          token,
          payload: {},
        });
      } catch (e) {
        setApproveError(e.message || "Erreur validation.");
      } finally {
        setApproveLoading(false);
      }
    },
    [token]
  );

  return {
    latestDraftReport,
    draftLoading,
    approveError,
    approveLoading,
    refreshLatestDraft,
    approveDraft,
  };
}
