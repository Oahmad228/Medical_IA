const express = require("express");
const { authRequired, requireRole } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimit");
const {
  requestPatientLinkOtp,
  confirmPatientLinkOtp,
  getPatientLinkStatus,
  listPendingLinks,
  requestPatientLinkOtpByEmail,
  confirmPatientLinkOtpByEmail,
  getPatientLinkStatusByEmail,
} = require("./doctor/otpHandlers");
const { getLatestDraftReport, approveReport } = require("./doctor/reportHandlers");

/**
 * [Module: src/routes/doctor.js]
 * Routeur des flux medecin (OTP et rapports).
 */

/**
 * [Module: src/routes/doctor.js] createDoctorRouter
 * Builds the doctor router and OTP/report endpoints.
 */
function createDoctorRouter() {
  const router = express.Router();
  router.post(
    "/doctor/patient-link/request-otp",
    authLimiter,
    authRequired,
    requireRole("DOCTOR"),
    requestPatientLinkOtp
  );
  router.post(
    "/doctor/patient-link/confirm-otp",
    authLimiter,
    authRequired,
    requireRole("DOCTOR"),
    confirmPatientLinkOtp
  );
  router.get(
    "/doctor/patient-link/status",
    authRequired,
    requireRole("DOCTOR"),
    getPatientLinkStatus
  );
  router.get(
    "/doctor/patient-link/pending",
    authRequired,
    requireRole("DOCTOR"),
    listPendingLinks
  );
  router.post(
    "/doctor/patient-link/request-otp-by-email",
    authLimiter,
    authRequired,
    requireRole("DOCTOR"),
    requestPatientLinkOtpByEmail
  );
  router.post(
    "/doctor/patient-link/confirm-otp-by-email",
    authLimiter,
    authRequired,
    requireRole("DOCTOR"),
    confirmPatientLinkOtpByEmail
  );
  router.get(
    "/doctor/patient-link/status-by-email",
    authRequired,
    requireRole("DOCTOR"),
    getPatientLinkStatusByEmail
  );
  router.get(
    "/doctor/reports/latest",
    authRequired,
    requireRole("DOCTOR"),
    getLatestDraftReport
  );
  router.post(
    "/doctor/reports/:reportId/approve",
    authLimiter,
    authRequired,
    requireRole("DOCTOR"),
    approveReport
  );
  return router;
}

module.exports = { createDoctorRouter };
