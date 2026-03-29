const express = require("express");
const { z } = require("zod");
const { prisma } = require("../db/prisma");
const { authRequired, requireRole } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimit");
const { sha256 } = require("../utils/crypto");
const { issueOtpCode, otpExpiryDate, getOtpTtlMinutes } = require("../utils/otp");
const { searchDoctorsFromOSM } = require("../services/doctorSearchService");
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
        emotionLevel: true,
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
 * Returns nearby doctors using OpenStreetMap (empty list if unavailable).
 */
async function searchDoctors(req, res) {
  try {
    const schema = z.object({
      near: z.string().trim().min(2).max(250).optional(),
      specialist: z.string().trim().min(2).max(120).optional(),
      lat: z.union([z.number(), z.string().trim()]).optional(),
      lng: z.union([z.number(), z.string().trim()]).optional(),
    });

    const parsed = schema.safeParse({
      near: req.query.near,
      specialist: req.query.specialist,
    });

    if (!parsed.success) {
      return res.status(400).json({ error: "Donnees invalides.", details: parsed.error.flatten() });
    }

    const { near, specialist, lat, lng } = parsed.data;
    const finalSpecialist = specialist || "medecin generaliste";
    const latitude = lat !== undefined ? Number(lat) : null;
    const longitude = lng !== undefined ? Number(lng) : null;

    const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);

    if (hasCoords) {
      const rows = await prisma.user.findMany({
        where: {
          role: "DOCTOR",
          status: "ACTIVE",
          doctorProfile: {
            isNot: null,
            clinicLat: { not: null },
            clinicLng: { not: null },
          },
        },
        include: { doctorProfile: true },
      });

      const normalizedSpecialist = String(finalSpecialist || "").toLowerCase();
      const filtered = rows.filter((row) => {
        const specialty = String(row.doctorProfile?.specialty || "").toLowerCase();
        return normalizedSpecialist ? specialty.includes(normalizedSpecialist) : true;
      });

      const toRad = (value) => (value * Math.PI) / 180;
      const distanceKm = (lat1, lng1, lat2, lng2) => {
        const r = 6371;
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return r * c;
      };

      const doctors = filtered
        .map((row) => {
          const profile = row.doctorProfile || {};
          return {
            userId: row.id,
            name: row.fullName,
            specialty: profile.specialty || null,
            yearsExperience: profile.yearsExperience ?? null,
            clinicName: profile.clinicName || null,
            address: profile.clinicAddress || profile.clinicCity || "",
            clinicCity: profile.clinicCity || null,
            clinicLat: profile.clinicLat,
            clinicLng: profile.clinicLng,
            clinicHours: profile.clinicHours || null,
            distanceKm: distanceKm(latitude, longitude, profile.clinicLat, profile.clinicLng),
          };
        })
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 30);

      return res.json({ doctors, usedGoogle: false });
    }

    let doctors = [];
    let usedGoogle = false;
    try {
      if (!near) {
        return res.status(400).json({ error: "Localisation requise." });
      }
      doctors = await searchDoctorsFromOSM({ specialist: finalSpecialist, near });
      usedGoogle = doctors.length > 0;
    } catch (_e) {
      doctors = [];
    }

    return res.json({ doctors, usedGoogle });
  } catch (error) {
    return res.status(500).json({ error: "Erreur patient/doctors/search", details: error.message });
  }
}

/**
 * [Module: src/routes/patient.js] suggestDoctors
 * Returns doctors matching a name query for appointment suggestions.
 */
async function suggestDoctors(req, res) {
  try {
    const schema = z.object({
      query: z.string().trim().min(2).max(120),
      limit: z.union([z.number(), z.string().trim()]).optional(),
    });

    const parsed = schema.safeParse({
      query: req.query.query,
      limit: req.query.limit,
    });

    if (!parsed.success) {
      return res.status(400).json({ error: "Donnees invalides.", details: parsed.error.flatten() });
    }

    const limit = Math.min(Math.max(Number(parsed.data.limit || 10), 1), 20);

    const doctors = await prisma.user.findMany({
      where: {
        role: "DOCTOR",
        status: "ACTIVE",
        fullName: { contains: parsed.data.query },
      },
      select: {
        id: true,
        fullName: true,
        doctorProfile: {
          select: {
            specialty: true,
            yearsExperience: true,
            clinicLat: true,
            clinicLng: true,
            clinicName: true,
            clinicAddress: true,
            clinicCity: true,
          },
        },
      },
      orderBy: { fullName: "asc" },
      take: Number.isFinite(limit) ? limit : 10,
    });

    return res.json({
      doctors: doctors.map((row) => ({
        userId: row.id,
        fullName: row.fullName,
        specialty: row.doctorProfile?.specialty || null,
        yearsExperience: row.doctorProfile?.yearsExperience ?? null,
        clinicLat: row.doctorProfile?.clinicLat ?? null,
        clinicLng: row.doctorProfile?.clinicLng ?? null,
        clinicName: row.doctorProfile?.clinicName || null,
        clinicAddress: row.doctorProfile?.clinicAddress || null,
        clinicCity: row.doctorProfile?.clinicCity || null,
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: "Erreur patient/doctors/suggest", details: error.message });
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
            specialty: { contains: patientSpecialist },
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
        emotionLevel: true,
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
  router.get("/patient/doctors/suggest", authRequired, requireRole("PATIENT"), suggestDoctors);
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
