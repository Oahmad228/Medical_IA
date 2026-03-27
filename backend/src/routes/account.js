const express = require("express");
const { z } = require("zod");
const { prisma } = require("../db/prisma");
const { authRequired, issueSession } = require("../middleware/auth");
const { ASSISTANT_PERSONAS } = require("../config/env");
const { hashPassword, verifyPassword } = require("../utils/crypto");
const { normalizeAssistantPersona } = require("../utils/persona");

/**
 * [Module: src/routes/account.js] formatUserProfile
 * Normalizes user payloads for account settings responses.
 */
function formatUserProfile(user) {
  if (!user) return null;
  const base = {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    status: user.status,
    patientId: user.patientProfile?.id || null,
  };

  if (user.role === "PATIENT") {
    return {
      ...base,
      age: user.patientProfile?.age ?? null,
      sex: user.patientProfile?.sex ?? null,
      city: user.patientProfile?.city ?? null,
      assistantPersona: user.patientProfile?.assistantPersona || "DOCTOR",
    };
  }

  if (user.role === "DOCTOR") {
    return {
      ...base,
      doctorProfile: user.doctorProfile
        ? {
            specialty: user.doctorProfile.specialty,
            yearsExperience: user.doctorProfile.yearsExperience ?? null,
            bio: user.doctorProfile.bio ?? null,
            clinicName: user.doctorProfile.clinicName ?? null,
            clinicAddress: user.doctorProfile.clinicAddress ?? null,
            clinicCity: user.doctorProfile.clinicCity ?? null,
            clinicLat: user.doctorProfile.clinicLat ?? null,
            clinicLng: user.doctorProfile.clinicLng ?? null,
          }
        : null,
    };
  }

  return base;
}

/**
 * [Module: src/routes/account.js] parseOptionalNumber
 * Converts optional number fields, returning null for empty strings.
 */
function parseOptionalNumber(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * [Module: src/routes/account.js] getMe
 * Returns the current user's profile details.
 */
async function getMe(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.id },
      include: { patientProfile: true, doctorProfile: true },
    });
    if (!user) {
      return res.status(404).json({ error: "Compte introuvable." });
    }
    return res.json({ user: formatUserProfile(user) });
  } catch (error) {
    return res.status(500).json({ error: "Erreur lecture profil", details: error.message });
  }
}

/**
 * [Module: src/routes/account.js] updateMe
 * Updates the current user's profile fields.
 */
async function updateMe(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.id },
      include: { patientProfile: true, doctorProfile: true },
    });
    if (!user) {
      return res.status(404).json({ error: "Compte introuvable." });
    }

    const baseSchema = z.object({
      fullName: z.string().trim().min(2).optional(),
    });

    const patientSchema = baseSchema.extend({
      age: z.union([z.number().int().min(0).max(120), z.string().trim()]).optional(),
      sex: z.string().trim().max(40).optional(),
      city: z.string().trim().max(120).optional(),
      assistantPersona: z.enum(ASSISTANT_PERSONAS).optional(),
    });

    const doctorSchema = baseSchema.extend({
      specialty: z.string().trim().min(2).optional(),
      yearsExperience: z.union([z.number().int().min(0).max(80), z.string().trim()]).optional(),
      bio: z.string().trim().max(2000).optional(),
      clinicName: z.string().trim().max(120).optional(),
      clinicAddress: z.string().trim().max(200).optional(),
      clinicCity: z.string().trim().max(120).optional(),
      clinicLat: z.union([z.number(), z.string().trim()]).optional(),
      clinicLng: z.union([z.number(), z.string().trim()]).optional(),
    });

    const parsed =
      user.role === "DOCTOR"
        ? doctorSchema.safeParse(req.body || {})
        : patientSchema.safeParse(req.body || {});

    if (!parsed.success) {
      return res.status(400).json({ error: "Donnees invalides.", details: parsed.error.flatten() });
    }

    const updates = parsed.data || {};
    const userData = {};
    if (updates.fullName) {
      userData.fullName = String(updates.fullName).trim();
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length > 0) {
        await tx.user.update({ where: { id: user.id }, data: userData });
      }

      if (user.role === "PATIENT" && user.patientProfile) {
        const patientData = {};
        if (updates.fullName) patientData.fullName = String(updates.fullName).trim();
        if (updates.age !== undefined) patientData.age = parseOptionalNumber(updates.age);
        if (updates.sex !== undefined) {
          const value = String(updates.sex || "").trim();
          patientData.sex = value ? value : null;
        }
        if (updates.city !== undefined) {
          const value = String(updates.city || "").trim();
          patientData.city = value ? value : null;
        }
        if (updates.assistantPersona) {
          patientData.assistantPersona = normalizeAssistantPersona(updates.assistantPersona);
        }

        if (Object.keys(patientData).length > 0) {
          await tx.patient.update({ where: { id: user.patientProfile.id }, data: patientData });
        }
      }

      if (user.role === "DOCTOR" && user.doctorProfile) {
        const doctorData = {};
        if (updates.specialty !== undefined) {
          const value = String(updates.specialty || "").trim();
          if (value) doctorData.specialty = value;
        }
        if (updates.yearsExperience !== undefined) {
          doctorData.yearsExperience = parseOptionalNumber(updates.yearsExperience);
        }
        if (updates.bio !== undefined) {
          const value = String(updates.bio || "").trim();
          doctorData.bio = value ? value : null;
        }
        if (updates.clinicName !== undefined) {
          const value = String(updates.clinicName || "").trim();
          doctorData.clinicName = value ? value : null;
        }
        if (updates.clinicAddress !== undefined) {
          const value = String(updates.clinicAddress || "").trim();
          doctorData.clinicAddress = value ? value : null;
        }
        if (updates.clinicCity !== undefined) {
          const value = String(updates.clinicCity || "").trim();
          doctorData.clinicCity = value ? value : null;
        }
        if (updates.clinicLat !== undefined) {
          doctorData.clinicLat = parseOptionalNumber(updates.clinicLat);
        }
        if (updates.clinicLng !== undefined) {
          doctorData.clinicLng = parseOptionalNumber(updates.clinicLng);
        }

        if (Object.keys(doctorData).length > 0) {
          await tx.doctorProfile.update({ where: { id: user.doctorProfile.id }, data: doctorData });
        }
      }
    });

    const refreshed = await prisma.user.findUnique({
      where: { id: user.id },
      include: { patientProfile: true, doctorProfile: true },
    });
    const token = issueSession(refreshed);

    return res.json({ token, user: formatUserProfile(refreshed) });
  } catch (error) {
    return res.status(500).json({ error: "Erreur mise a jour profil", details: error.message });
  }
}

/**
 * [Module: src/routes/account.js] changePassword
+ * Updates the current user's password after verifying the current one.
 */
async function changePassword(req, res) {
  try {
    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Donnees invalides.", details: parsed.error.flatten() });
    }

    const user = await prisma.user.findUnique({ where: { id: req.session.id } });
    if (!user) {
      return res.status(404).json({ error: "Compte introuvable." });
    }

    if (!verifyPassword(user.passwordHash, String(parsed.data.currentPassword))) {
      return res.status(403).json({ error: "Mot de passe actuel incorrect." });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(String(parsed.data.newPassword)) },
    });

    return res.json({ message: "Mot de passe mis a jour." });
  } catch (error) {
    return res.status(500).json({ error: "Erreur changement mot de passe", details: error.message });
  }
}

/**
 * [Module: src/routes/account.js] deleteMe
 * Deletes the current user's account and dependent data.
 */
async function deleteMe(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.id },
      include: { patientProfile: true, doctorProfile: true },
    });
    if (!user) {
      return res.status(404).json({ error: "Compte introuvable." });
    }
    if (user.role === "SUPERADMIN") {
      return res.status(403).json({ error: "Suppression indisponible pour ce role." });
    }

    await prisma.$transaction(async (tx) => {
      await tx.chatMessage.deleteMany({
        where: { conversation: { userId: user.id } },
      });
      await tx.conversation.deleteMany({ where: { userId: user.id } });
      await tx.emailVerificationToken.deleteMany({ where: { userId: user.id } });
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });

      if (user.patientProfile) {
        const patientId = user.patientProfile.id;
        await tx.symptomReport.deleteMany({ where: { patientId } });
        await tx.doctorAnalysis.deleteMany({ where: { patientId } });
        await tx.doctorPatientLink.deleteMany({ where: { patientId } });
        await tx.pairingOtp.deleteMany({ where: { patientId } });
        await tx.patientReport.deleteMany({ where: { patientId } });
        await tx.appointment.deleteMany({ where: { patientId } });
        await tx.patient.delete({ where: { id: patientId } });
      }

      if (user.doctorProfile) {
        await tx.doctorPatientLink.deleteMany({ where: { doctorUserId: user.id } });
        await tx.pairingOtp.deleteMany({ where: { doctorUserId: user.id } });
        await tx.patientReport.deleteMany({ where: { doctorUserId: user.id } });
        await tx.appointment.deleteMany({ where: { doctorUserId: user.id } });
        await tx.doctorAnalysis.deleteMany({ where: { doctorUserId: user.id } });
        await tx.doctorProfile.delete({ where: { userId: user.id } });
      }

      await tx.user.delete({ where: { id: user.id } });
    });

    return res.json({ message: "Compte supprime." });
  } catch (error) {
    return res.status(500).json({ error: "Erreur suppression compte", details: error.message });
  }
}

/**
 * [Module: src/routes/account.js] createAccountRouter
 * Builds account management routes for authenticated users.
 */
function createAccountRouter() {
  const router = express.Router();
  router.get("/me", authRequired, getMe);
  router.patch("/me", authRequired, updateMe);
  router.post("/me/change-password", authRequired, changePassword);
  router.delete("/me", authRequired, deleteMe);
  return router;
}

module.exports = {
  createAccountRouter,
  getMe,
  updateMe,
  changePassword,
  deleteMe,
};
