const { z } = require("zod");
const { prisma } = require("../../db/prisma");
const { sha256 } = require("../../utils/crypto");
const {
  getOtpTtlMinutes,
  getDoctorPatientActiveTtlExpiresAt,
  isValidOtpCode,
  issueOtpCode,
  otpExpiryDate,
} = require("../../utils/otp");
const { DOCTOR_PATIENT_OTP_MAX_ATTEMPTS } = require("../../config/env");
const { sendEmail } = require("../../services/emailService");
const { getPatientForEmailString } = require("../../services/patientService");
const { ensureDraftReportExistsForDoctorPatient } = require("../../services/conversationService");

/**
 * [Module: src/routes/doctor/otpEmailHandlers.js]
 * OTP d'association medecin/patient (via email patient).
 */

/**
 * Demarre un OTP d'association a partir d'un email patient.
 */
async function requestPatientLinkOtpByEmail(req, res) {
  try {
    const schema = z.object({
      patientEmail: z.string().trim().email(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Donnees invalides.", details: parsed.error.flatten() });
    }

    const { patientEmail } = parsed.data;
    const patientRef = await getPatientForEmailString(patientEmail);
    if (!patientRef) return res.status(404).json({ error: "Patient introuvable pour cet email." });

    const patientId = patientRef.patientId;

    await prisma.pairingOtp.deleteMany({
      where: { doctorUserId: req.session.id, patientId },
    });

    await prisma.doctorPatientLink.deleteMany({
      where: { doctorUserId: req.session.id, patientId },
    });

    const rawOtp = issueOtpCode();
    const otpHash = sha256(rawOtp);

    await prisma.pairingOtp.create({
      data: {
        doctorUserId: req.session.id,
        patientId,
        otpHash,
        expiresAt: otpExpiryDate(),
        attempts: 0,
      },
    });

    await prisma.doctorPatientLink.create({
      data: {
        doctorUserId: req.session.id,
        patientId,
        status: "PENDING",
      },
    });

    const to = patientRef.email;
    const subject = "Code OTP - Association medecin/patient (Medical AI)";
    const text = `Bonjour ${patientRef.fullName || ""},\n\nVotre code OTP pour associer votre patient a un medecin est : ${rawOtp}\n\nCe code expire dans ${getOtpTtlMinutes()} minutes.`;

    try {
      await sendEmail({ to, subject, text });
    } catch (_e) {
      // best effort
    }

    return res.json({
      message: "OTP envoye (best effort).",
      status: "PENDING",
      patientId,
      expiresInMinutes: getOtpTtlMinutes(),
    });
  } catch (error) {
    return res.status(500).json({ error: "Erreur request-otp-by-email", details: error.message });
  }
}

/**
 * Confirme un OTP d'association a partir d'un email patient.
 */
async function confirmPatientLinkOtpByEmail(req, res) {
  try {
    const schema = z.object({
      patientEmail: z.string().trim().email(),
      otp: z.string().trim(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Donnees invalides.", details: parsed.error.flatten() });
    }

    const { patientEmail, otp } = parsed.data;
    if (!isValidOtpCode(otp)) {
      return res.status(400).json({ error: "OTP invalide. Format attendu: 4 a 6 chiffres." });
    }

    const patientRef = await getPatientForEmailString(patientEmail);
    if (!patientRef) return res.status(404).json({ error: "Patient introuvable pour cet email." });

    const patientId = patientRef.patientId;

    const now = new Date();
    const record = await prisma.pairingOtp.findFirst({
      where: {
        doctorUserId: req.session.id,
        patientId,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!record) {
      return res.status(403).json({ error: "OTP invalide ou expire." });
    }

    const currentAttempts = Number(record.attempts || 0);
    if (currentAttempts >= DOCTOR_PATIENT_OTP_MAX_ATTEMPTS) {
      await prisma.doctorPatientLink
        .updateMany({
          where: { doctorUserId: req.session.id, patientId },
          data: { status: "EXPIRED" },
        })
        .catch(() => {});
      return res.status(403).json({ error: "Nombre de tentatives depasse." });
    }

    const otpHash = sha256(otp);
    const otpMatches = record.otpHash === otpHash;
    if (!otpMatches) {
      await prisma.pairingOtp
        .update({
          where: { id: record.id },
          data: { attempts: currentAttempts + 1 },
        })
        .catch(() => {});
      return res.status(403).json({ error: "OTP incorrect." });
    }

    await prisma.pairingOtp.update({
      where: { id: record.id },
      data: { consumedAt: new Date(), attempts: currentAttempts + 1 },
    });

    await prisma.doctorPatientLink.updateMany({
      where: { doctorUserId: req.session.id, patientId },
      data: { status: "ACTIVE", updatedAt: new Date(), expiresAt: getDoctorPatientActiveTtlExpiresAt() },
    });

    try {
      await ensureDraftReportExistsForDoctorPatient({
        doctorUserId: req.session.id,
        patientId,
      });
    } catch (_e) {
      // best effort
    }

    return res.json({
      message: "Association via OTP confirmee. Rapport autorise.",
      status: "ACTIVE",
      patientId,
    });
  } catch (error) {
    return res.status(500).json({ error: "Erreur confirm-otp-by-email", details: error.message });
  }
}

/**
 * Retourne le statut d'association par email patient.
 */
async function getPatientLinkStatusByEmail(req, res) {
  try {
    const schema = z.object({ patientEmail: z.string().trim().email() });
    const parsed = schema.safeParse({ patientEmail: req.query.patientEmail });
    if (!parsed.success) {
      return res.status(400).json({ error: "Donnees invalides.", details: parsed.error.flatten() });
    }

    const { patientEmail } = parsed.data;
    const patientRef = await getPatientForEmailString(patientEmail);
    if (!patientRef) return res.status(404).json({ error: "Patient introuvable pour cet email." });

    const patientId = patientRef.patientId;
    const link = await prisma.doctorPatientLink.findFirst({
      where: { doctorUserId: req.session.id, patientId },
      orderBy: { updatedAt: "desc" },
    });

    const now = new Date();
    const status =
      link?.status === "ACTIVE" && link.expiresAt && link.expiresAt <= now
        ? "EXPIRED"
        : link?.status || "NONE";
    return res.json({ status, patientId });
  } catch (error) {
    return res.status(500).json({ error: "Erreur status-by-email", details: error.message });
  }
}

module.exports = {
  requestPatientLinkOtpByEmail,
  confirmPatientLinkOtpByEmail,
  getPatientLinkStatusByEmail,
};
