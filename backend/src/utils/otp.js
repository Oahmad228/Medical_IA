const crypto = require("crypto");
const {
  DOCTOR_PATIENT_OTP_TTL_MINUTES,
  DOCTOR_PATIENT_LINK_TTL_HOURS,
} = require("../config/env");

/**
 * [Module: src/utils/otp.js] getOtpTtlMinutes
 * Returns OTP validity duration in minutes with safe fallback.
 */
function getOtpTtlMinutes() {
  return DOCTOR_PATIENT_OTP_TTL_MINUTES > 0 ? DOCTOR_PATIENT_OTP_TTL_MINUTES : 10;
}

/**
 * [Module: src/utils/otp.js] getDoctorPatientActiveTtlExpiresAt
 * Computes expiration time for active doctor-patient links.
 */
function getDoctorPatientActiveTtlExpiresAt() {
  const hours = DOCTOR_PATIENT_LINK_TTL_HOURS > 0 ? DOCTOR_PATIENT_LINK_TTL_HOURS : 24;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

/**
 * [Module: src/utils/otp.js] isValidOtpCode
 * Validates OTP format (4-6 digits).
 */
function isValidOtpCode(code) {
  const s = String(code || "").trim();
  return /^\d{4,6}$/.test(s);
}

/**
 * [Module: src/utils/otp.js] issueOtpCode
 * Generates a 6-digit OTP code.
 */
function issueOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * [Module: src/utils/otp.js] otpExpiryDate
 * Returns the expiration date for a newly created OTP.
 */
function otpExpiryDate() {
  return new Date(Date.now() + getOtpTtlMinutes() * 60 * 1000);
}

module.exports = {
  getOtpTtlMinutes,
  getDoctorPatientActiveTtlExpiresAt,
  isValidOtpCode,
  issueOtpCode,
  otpExpiryDate,
};
