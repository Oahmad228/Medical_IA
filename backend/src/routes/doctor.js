const express = require("express");
const { z } = require("zod");
const { prisma } = require("../db/prisma");
const { authRequired, requireRole } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimit");
const { sha256 } = require("../utils/crypto");
const {
  getOtpTtlMinutes,
  getDoctorPatientActiveTtlExpiresAt,
  isValidOtpCode,
  issueOtpCode,
  otpExpiryDate,
} = require("../utils/otp");
const { DOCTOR_PATIENT_OTP_MAX_ATTEMPTS } = require("../config/env");
const { sendEmail } = require("../services/emailService");
const { ensureDoctorHasActiveLink, getPatientForEmailString } = require("../services/patientService");
const { ensureDraftReportExistsForDoctorPatient } = require("../services/conversationService");
const { generatePatientReportFromDoctor } = require("../services/llmService");

/**
 * [Module: src/routes/doctor.js] requestPatientLinkOtp
 * Starts OTP pairing for a doctor and patient ID.
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
 * [Module: src/routes/doctor.js] confirmPatientLinkOtp
 * Confirms OTP for a doctor and patient ID.
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
 * [Module: src/routes/doctor.js] getPatientLinkStatus
 * Returns OTP link status for a given patient.
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
 * [Module: src/routes/doctor.js] listPendingLinks
 * Returns pending OTP links for the current doctor.
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

/**
 * [Module: src/routes/doctor.js] requestPatientLinkOtpByEmail
 * Starts OTP pairing using a patient email address.
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
 * [Module: src/routes/doctor.js] confirmPatientLinkOtpByEmail
 * Confirms OTP pairing using a patient email address.
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
 * [Module: src/routes/doctor.js] getPatientLinkStatusByEmail
 * Returns link status by patient email.
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

/**
 * [Module: src/routes/doctor.js] getLatestDraftReport
 * Returns latest draft report for a doctor and patient.
 */
async function getLatestDraftReport(req, res) {
  try {
    const patientId = Number(req.query.patientId);
    if (!Number.isInteger(patientId) || patientId <= 0) {
      return res.status(400).json({ error: "patientId invalide." });
    }

    const linkOk = await ensureDoctorHasActiveLink({
      doctorUserId: req.session.id,
      patientId,
    });
    if (!linkOk) {
      return res.status(403).json({ error: "Patient non autorise (OTP obligatoire)." });
    }

    const report = await prisma.patientReport.findFirst({
      where: { doctorUserId: req.session.id, patientId, status: "DRAFT" },
      orderBy: { createdAt: "desc" },
    });

    return res.json({ report: report || null });
  } catch (error) {
    return res.status(500).json({ error: "Erreur doctor/reports/latest", details: error.message });
  }
}

/**
 * [Module: src/routes/doctor.js] approveReport
 * Approves a draft report and creates a patient-friendly version.
 */
async function approveReport(req, res) {
  try {
    const reportId = Number(req.params.reportId);
    if (!Number.isInteger(reportId) || reportId <= 0) {
      return res.status(400).json({ error: "reportId invalide." });
    }

    const schema = z.object({
      editedDoctorDraftText: z.string().trim().optional(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Donnees invalides.", details: parsed.error.flatten() });
    }

    const draft = await prisma.patientReport.findUnique({ where: { id: reportId } });
    if (!draft) {
      return res.status(404).json({ error: "Rapport introuvable." });
    }
    if (draft.doctorUserId !== req.session.id) {
      return res.status(403).json({ error: "Acces refuse." });
    }
    if (draft.status !== "DRAFT") {
      return res.status(400).json({ error: "Rapport pas en mode draft." });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: draft.patientId },
      include: { user: true },
    });
    if (!patient || !patient.user) {
      return res.status(404).json({ error: "Patient introuvable (ou email manquant)." });
    }

    const doctorDraftText = parsed.data.editedDoctorDraftText || draft.doctorDraftText;

    const patientFinalText = await generatePatientReportFromDoctor({
      patient,
      doctorDraftText,
      triageLevel: draft.triageLevel,
      triageSummary: draft.triageSummary,
      guidance: draft.guidance,
      nextStep: draft.nextStep,
      specialist: draft.specialist,
    }).catch(() => {
      return `Votre medecin a valide un rapport. Niveau de vigilance: ${draft.triageLevel || "N/A"}. ${
        draft.nextStep ? `Prochaines etapes: ${draft.nextStep}` : ""
      }`;
    });

    const approvedAt = new Date();
    let status = "APPROVED";
    let sentAt = null;

    try {
      await sendEmail({
        to: patient.user.email,
        subject: "Votre rapport patient - Medical AI",
        text: `Bonjour ${patient.user.fullName || patient.fullName},\n\nVoici le rapport valide par votre medecin.\n\n${patientFinalText}\n`,
      });
      status = "SENT";
      sentAt = new Date();
    } catch (_e) {
      // best effort
    }

    await prisma.patientReport.update({
      where: { id: reportId },
      data: {
        doctorDraftText,
        patientFinalText,
        approvedAt,
        sentAt,
        status,
      },
    });

    return res.json({ message: "Rapport approuve.", status });
  } catch (error) {
    return res.status(500).json({ error: "Erreur approve-report", details: error.message });
  }
}

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
