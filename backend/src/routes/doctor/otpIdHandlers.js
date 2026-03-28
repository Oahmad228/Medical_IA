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
const { ensureDraftReportExistsForDoctorPatient } = require("../../services/conversationService");

/**
 * [Module: src/routes/doctor/otpIdHandlers.js]
 * OTP d'association medecin/patient (par ID patient).
 */

/**
 * Demarre un OTP d'association pour un patient (par ID).
 */
async function requestPatientLinkOtp(req, res) {
  try {
    const schema = z.object({
      patientId: z.union([z.number().int().positive(), z.string().trim().min(1)]),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Donnees invalides.", details: parsed.error.flatten() });
    }

    const patientId = Number(parsed.data.patientId);
    if (!Number.isInteger(patientId) || patientId <= 0) {
      return res.status(400).json({ error: "patientId invalide." });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: { user: true },
    });
    if (!patient || !patient.user) {
      return res.status(404).json({ error: "Patient introuvable (ou email manquant)." });
    }

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

    const to = patient.user.email;
    const subject = "Code OTP - Association medecin/patient (Medical AI)";
    const text = `Bonjour ${patient.user.fullName || ""},\n\nVotre code OTP pour associer votre patient a un medecin est: ${rawOtp}\n\nCe code expire dans ${getOtpTtlMinutes()} minutes.`;

    try {
      await sendEmail({ to, subject, text });
    } catch (_e) {
      // best effort
    }

    return res.json({ message: "OTP envoye (best effort).", expiresInMinutes: getOtpTtlMinutes() });
  } catch (error) {
    return res.status(500).json({ error: "Erreur request-otp", details: error.message });
  }
}

/**
 * Confirme un OTP d'association (par ID patient).
 */
async function confirmPatientLinkOtp(req, res) {
  try {
    const schema = z.object({
      patientId: z.union([z.number().int().positive(), z.string().trim().min(1)]),
      otp: z.string().trim(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Donnees invalides.", details: parsed.error.flatten() });
    }

    const patientId = Number(parsed.data.patientId);
    const otp = parsed.data.otp;

    if (!Number.isInteger(patientId) || patientId <= 0) {
      return res.status(400).json({ error: "patientId invalide." });
    }
    if (!isValidOtpCode(otp)) {
      return res.status(400).json({ error: "OTP invalide. Format attendu: 4 a 6 chiffres." });
    }

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

    return res.json({ message: "Association confirme. Rapport autorise.", status: "ACTIVE" });
  } catch (error) {
    return res.status(500).json({ error: "Erreur confirm-otp", details: error.message });
  }
}

/**
 * Retourne le statut d'association (par ID patient).
 */
async function getPatientLinkStatus(req, res) {
  try {
    const patientId = Number(req.query.patientId);
    if (!Number.isInteger(patientId) || patientId <= 0) {
      return res.status(400).json({ error: "patientId invalide." });
    }

    const link = await prisma.doctorPatientLink.findFirst({
      where: { doctorUserId: req.session.id, patientId },
      orderBy: { updatedAt: "desc" },
    });
    const now = new Date();
    const status =
      link?.status === "ACTIVE" && link.expiresAt && link.expiresAt <= now
        ? "EXPIRED"
        : link?.status || "NONE";
    return res.json({ status });
  } catch (error) {
    return res.status(500).json({ error: "Erreur status-link", details: error.message });
  }
}

/**
 * Liste les associations OTP en attente pour le medecin courant.
 */
async function listPendingLinks(req, res) {
  try {
    const links = await prisma.doctorPatientLink.findMany({
      where: { doctorUserId: req.session.id, status: "PENDING" },
      orderBy: { updatedAt: "desc" },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            user: { select: { email: true } },
            city: true,
            symptomReports: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                triageLevel: true,
                specialist: true,
                location: true,
                triageSummary: true,
                createdAt: true,
              },
            },
          },
        },
      },
      take: 10,
    });

    return res.json({
      links: links.map((l) => ({
        doctorPatientLinkId: l.id,
        patientId: l.patientId,
        patientName: l.patient?.fullName || "",
        patientEmail: l.patient?.user?.email || null,
        patientCity: l.patient?.city || null,
        status: l.status,
        latestSymptom: (l.patient?.symptomReports || [])[0] || null,
        updatedAt: l.updatedAt,
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: "Erreur doctor/patient-link/pending", details: error.message });
  }
}

module.exports = {
  requestPatientLinkOtp,
  confirmPatientLinkOtp,
  getPatientLinkStatus,
  listPendingLinks,
};
