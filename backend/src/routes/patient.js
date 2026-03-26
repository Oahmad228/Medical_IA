const express = require("express");
const { z } = require("zod");
const { prisma } = require("../db/prisma");
const { authRequired, requireRole } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimit");
const { AI_MODE, GOOGLE_MAPS_API_KEY } = require("../config/env");
const { sha256 } = require("../utils/crypto");
const { issueOtpCode, otpExpiryDate, getOtpTtlMinutes } = require("../utils/otp");
const { getMockDoctors, searchDoctorsFromGoogle } = require("../services/doctorSearchService");
const { sendEmail } = require("../services/emailService");

/**
 * [Module: src/routes/patient.js] createPatient
 * Creates a standalone patient record (admin/dev usage).
 */
async function createPatient(req, res) {
  try {
    const { fullName, age, sex, city } = req.body || {};

    if (!fullName || typeof fullName !== "string") {
      return res.status(400).json({ error: "Le champ 'fullName' est requis." });
    }

    const patient = await prisma.patient.create({
      data: {
        fullName: fullName.trim(),
        age: Number.isInteger(age) ? age : null,
        sex: typeof sex === "string" ? sex.trim() : null,
        city: typeof city === "string" ? city.trim() : null,
      },
    });

    return res.status(201).json(patient);
  } catch (error) {
    return res.status(500).json({ error: "Erreur creation patient", details: error.message });
  }
}

/**
 * [Module: src/routes/patient.js] getPatientHistory
 * Returns historical symptom and doctor analysis data for a patient.
 */
async function getPatientHistory(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "ID patient invalide." });
    }

    const patient = await prisma.patient.findUnique({
      where: { id },
      include: {
        symptomReports: { orderBy: { createdAt: "desc" } },
        doctorAnalyses: { orderBy: { createdAt: "desc" } },
        user: true,
      },
    });

    if (!patient) {
      return res.status(404).json({ error: "Patient introuvable." });
    }

    const isOwner = patient.userId && patient.userId === req.session.id;
    const canView =
      req.session.role === "SUPERADMIN" || req.session.role === "DOCTOR" || Boolean(isOwner);

    if (!canView) {
      return res.status(403).json({ error: "Acces refuse." });
    }

    if (isOwner && req.session.role === "PATIENT") {
      return res.status(403).json({
        error: "Historique medical longitudinal indisponible cote patient.",
      });
    }

    return res.json(patient);
  } catch (error) {
    return res.status(500).json({ error: "Erreur lecture historique", details: error.message });
  }
}

/**
 * [Module: src/routes/patient.js] getLatestSymptomReport
 * Returns the patient's latest triage report.
 */
async function getLatestSymptomReport(req, res) {
  try {
    const patient = await prisma.patient.findUnique({
      where: { userId: req.session.id },
      include: { user: true },
    });

    if (!patient?.id) return res.status(404).json({ error: "Patient introuvable." });

    const report = await prisma.symptomReport.findFirst({
      where: { patientId: patient.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        triageLevel: true,
        triageSummary: true,
        guidance: true,
        nextStep: true,
        specialist: true,
        location: true,
        doctorsJson: true,
        createdAt: true,
      },
    });

    if (!report) return res.json({ report: null });

    let doctors = [];
    try {
      doctors = JSON.parse(report.doctorsJson || "[]");
      if (!Array.isArray(doctors)) doctors = [];
    } catch (_e) {
      doctors = [];
    }

    return res.json({
      report: {
        ...report,
        doctors,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Erreur patient/symptom-reports/latest", details: error.message });
  }
}

/**
 * [Module: src/routes/patient.js] getPatientDoctorLinkStatus
 * Returns patient-doctor link status (OTP workflow).
 */
async function getPatientDoctorLinkStatus(req, res) {
  try {
    const patient = await prisma.patient.findUnique({
      where: { userId: req.session.id },
    });
    if (!patient?.id) return res.status(404).json({ error: "Patient introuvable." });

    const latestSymptom = await prisma.symptomReport.findFirst({
      where: { patientId: patient.id },
      orderBy: { createdAt: "desc" },
      select: { triageLevel: true, specialist: true, location: true, createdAt: true },
    });

    const link = await prisma.doctorPatientLink.findFirst({
      where: { patientId: patient.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        doctorUserId: true,
        status: true,
        updatedAt: true,
        doctor: { select: { fullName: true, doctorProfile: { select: { specialty: true } } } },
      },
    });

    return res.json({
      status: link?.status || "NONE",
      doctor: link?.doctor
        ? {
            userId: link.doctorUserId,
            fullName: link.doctor.fullName,
            specialty: link.doctor.doctorProfile?.specialty || null,
          }
        : null,
      latestSymptom: latestSymptom || null,
    });
  } catch (error) {
    return res.status(500).json({ error: "Erreur patient/doctor-link/status", details: error.message });
  }
}

/**
 * [Module: src/routes/patient.js] searchDoctors
 * Returns nearby doctors using Google Places or fallback data.
 */
async function searchDoctors(req, res) {
  try {
    const schema = z.object({
      near: z.string().trim().min(2).max(250),
      specialist: z.string().trim().min(2).max(120).optional(),
    });

    const parsed = schema.safeParse({
      near: req.query.near,
      specialist: req.query.specialist,
    });

    if (!parsed.success) {
      return res.status(400).json({ error: "Donnees invalides.", details: parsed.error.flatten() });
    }

    const { near, specialist } = parsed.data;
    const finalSpecialist = specialist || "medecin generaliste";

    let doctors = [];
    let usedGoogle = false;
    if (AI_MODE === "live" && GOOGLE_MAPS_API_KEY) {
      try {
        doctors = await searchDoctorsFromGoogle({ specialist: finalSpecialist, near });
        usedGoogle = true;
      } catch (_e) {
        doctors = [];
      }
    }

    if (!doctors.length) {
      doctors = getMockDoctors(finalSpecialist, near);
    }

    return res.json({ doctors, usedGoogle });
  } catch (error) {
    return res.status(500).json({ error: "Erreur patient/doctors/search", details: error.message });
  }
}

/**
 * [Module: src/routes/patient.js] requestConsultation
 * Starts an OTP-based consultation request for the patient.
 */
async function requestConsultation(req, res) {
  try {
    const schema = z.object({
      doctorUserId: z.number().int().positive().optional(),
      location: z.string().trim().max(200).optional(),
    });

    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Donnees invalides.", details: parsed.error.flatten() });
    }

    const patient = await prisma.patient.findUnique({
      where: { userId: req.session.id },
      include: { user: true },
    });
    if (!patient?.id || !patient.user?.email) {
      return res.status(404).json({ error: "Patient introuvable (ou email manquant)." });
    }

    const latestSymptom = await prisma.symptomReport.findFirst({
      where: { patientId: patient.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, specialist: true, location: true },
    });

    const patientSpecialist = latestSymptom?.specialist || "medecin generaliste";

    if (typeof parsed.data.location === "string" && parsed.data.location.trim() && latestSymptom?.id) {
      await prisma.symptomReport
        .updateMany({
          where: { patientId: patient.id, id: latestSymptom.id },
          data: { location: parsed.data.location.trim() },
        })
        .catch(() => {});
    }

    let doctorUserId = parsed.data.doctorUserId;

    if (!doctorUserId) {
      const candidates = await prisma.user.findMany({
        where: {
          role: "DOCTOR",
          status: "ACTIVE",
          doctorProfile: {
            specialty: { contains: patientSpecialist, mode: "insensitive" },
          },
        },
        include: { doctorProfile: true },
      });

      const fallbackCandidates = candidates.length
        ? candidates
        : await prisma.user.findMany({
            where: { role: "DOCTOR", status: "ACTIVE" },
            include: { doctorProfile: true },
            take: 15,
          });

      const sorted = fallbackCandidates
        .filter((u) => u.doctorProfile?.specialty)
        .sort((a, b) => Number(b.doctorProfile?.yearsExperience || 0) - Number(a.doctorProfile?.yearsExperience || 0));

      doctorUserId = sorted[0]?.id || null;
    }

    if (!doctorUserId) {
      return res.status(409).json({ error: "Aucun medecin disponible dans l'app pour ce profil." });
    }

    const alreadyActive = await prisma.doctorPatientLink.findFirst({
      where: { doctorUserId, patientId: patient.id, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
    });
    if (alreadyActive) {
      return res.json({ message: "Association deja activee.", status: "ACTIVE" });
    }

    await prisma.pairingOtp.deleteMany({ where: { doctorUserId, patientId: patient.id } });
    await prisma.doctorPatientLink.deleteMany({ where: { doctorUserId, patientId: patient.id } });

    const rawOtp = issueOtpCode();
    const otpHash = sha256(rawOtp);
    await prisma.pairingOtp.create({
      data: {
        doctorUserId,
        patientId: patient.id,
        otpHash,
        expiresAt: otpExpiryDate(),
        attempts: 0,
      },
    });

    await prisma.doctorPatientLink.create({
      data: {
        doctorUserId,
        patientId: patient.id,
        status: "PENDING",
      },
    });

    const to = patient.user.email;
    const subject = "Code OTP - Consultation dans l'app (Medical AI)";
    const text = `Bonjour ${patient.fullName || ""},\n\nVotre code OTP pour associer votre dossier a un medecin est : ${rawOtp}\n\nCe code expire dans ${getOtpTtlMinutes()} minutes.`;

    try {
      await sendEmail({ to, subject, text });
    } catch (_e) {
      // best effort
    }

    const doctor = await prisma.user.findUnique({
      where: { id: doctorUserId },
      select: { fullName: true },
    });

    return res.json({
      message: "Demande de consultation creee. Un code OTP a ete envoye au patient (best effort).",
      status: "PENDING",
      expiresInMinutes: getOtpTtlMinutes(),
      doctor: doctor || null,
    });
  } catch (error) {
    return res.status(500).json({ error: "Erreur patient/consultation/request", details: error.message });
  }
}

/**
 * [Module: src/routes/patient.js] getLatestReport
 * Returns latest approved/sent report for the patient.
 */
async function getLatestReport(req, res) {
  try {
    const patient = await prisma.patient.findUnique({
      where: { userId: req.session.id },
      select: { id: true },
    });
    if (!patient?.id) {
      return res.status(404).json({ error: "Patient introuvable." });
    }

    const report = await prisma.patientReport.findFirst({
      where: { patientId: patient.id, status: { in: ["APPROVED", "SENT"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        triageLevel: true,
        patientFinalText: true,
        approvedAt: true,
        sentAt: true,
      },
    });

    return res.json({ report: report || null });
  } catch (error) {
    return res.status(500).json({ error: "Erreur patient/reports/latest", details: error.message });
  }
}

/**
 * [Module: src/routes/patient.js] createPatientRouter
 * Builds the patient router (includes /patient and /patients endpoints).
 */
function createPatientRouter() {
  const router = express.Router();
  router.post("/patients", createPatient);
  router.get("/patients/:id/history", authRequired, getPatientHistory);
  router.get("/patient/symptom-reports/latest", authRequired, requireRole("PATIENT"), getLatestSymptomReport);
  router.get("/patient/doctor-link/status", authRequired, requireRole("PATIENT"), getPatientDoctorLinkStatus);
  router.get("/patient/doctors/search", authRequired, requireRole("PATIENT"), searchDoctors);
  router.post(
    "/patient/consultation/request",
    authLimiter,
    authRequired,
    requireRole("PATIENT"),
    requestConsultation
  );
  router.get("/patient/reports/latest", authRequired, requireRole("PATIENT"), getLatestReport);
  return router;
}

module.exports = { createPatientRouter };
