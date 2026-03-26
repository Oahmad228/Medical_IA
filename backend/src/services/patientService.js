const { prisma } = require("../db/prisma");

/**
 * [Module: src/services/patientService.js] ensurePatientExists
 * Returns true if a patient exists for the given ID.
 */
async function ensurePatientExists(patientId) {
  const id = Number(patientId);
  if (!Number.isInteger(id) || id <= 0) return false;
  const patient = await prisma.patient.findUnique({ where: { id } });
  return Boolean(patient);
}

/**
 * [Module: src/services/patientService.js] ensureDoctorHasActiveLink
 * Checks if a doctor-patient link is active and not expired.
 */
async function ensureDoctorHasActiveLink({ doctorUserId, patientId }) {
  const doctorId = Number(doctorUserId);
  const pId = Number(patientId);
  if (!Number.isInteger(doctorId) || !Number.isInteger(pId) || pId <= 0) return false;
  const now = new Date();
  const link = await prisma.doctorPatientLink.findFirst({
    where: { doctorUserId: doctorId, patientId: pId, status: "ACTIVE", expiresAt: { gt: now } },
  });
  return Boolean(link);
}

/**
 * [Module: src/services/patientService.js] getPatientForEmail
 * Returns patient record and email for direct ID lookups.
 */
async function getPatientForEmail(patientId) {
  const pId = Number(patientId);
  if (!Number.isInteger(pId) || pId <= 0) return null;
  return prisma.patient.findUnique({
    where: { id: pId },
    select: { id: true, user: { select: { email: true, fullName: true } }, fullName: true },
  });
}

/**
 * [Module: src/services/patientService.js] getPatientForEmailString
 * Resolves a patient reference using the patient user's email.
 */
async function getPatientForEmailString(patientEmail) {
  const email = String(patientEmail || "").trim().toLowerCase();
  if (!email) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      patientProfile: { select: { id: true } },
    },
  });

  if (!user || user.role !== "PATIENT" || !user.patientProfile?.id) return null;
  return { patientId: user.patientProfile.id, patientUserId: user.id, fullName: user.fullName, email: user.email };
}

module.exports = {
  ensurePatientExists,
  ensureDoctorHasActiveLink,
  getPatientForEmail,
  getPatientForEmailString,
};
