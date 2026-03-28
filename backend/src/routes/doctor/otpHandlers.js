const {
  requestPatientLinkOtp,
  confirmPatientLinkOtp,
  getPatientLinkStatus,
  listPendingLinks,
} = require("./otpIdHandlers");
const {
  requestPatientLinkOtpByEmail,
  confirmPatientLinkOtpByEmail,
  getPatientLinkStatusByEmail,
} = require("./otpEmailHandlers");

/**
 * [Module: src/routes/doctor/otpHandlers.js]
 * Facade des handlers OTP medecin/patient.
 */

module.exports = {
  requestPatientLinkOtp,
  confirmPatientLinkOtp,
  getPatientLinkStatus,
  listPendingLinks,
  requestPatientLinkOtpByEmail,
  confirmPatientLinkOtpByEmail,
  getPatientLinkStatusByEmail,
};
