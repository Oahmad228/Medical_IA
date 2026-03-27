const express = require("express");
const { z } = require("zod");
const { prisma } = require("../db/prisma");
const { authLimiter } = require("../middleware/rateLimit");
const { authRequired, issueSession } = require("../middleware/auth");
const { ASSISTANT_PERSONAS } = require("../config/env");
const { hashPassword, verifyPassword, sha256 } = require("../utils/crypto");
const { normalizeAssistantPersona } = require("../utils/persona");
const {
  ensureEmailServiceConfigured,
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require("../services/emailService");

/**
 * [Module: src/routes/auth.js] formatUserProfile
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
 * [Module: src/routes/auth.js] parseOptionalNumber
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
 * [Module: src/routes/auth.js] signupPatient
 * Creates a patient account and sends a verification email.
 */
async function signupPatient(req, res) {
  try {
    ensureEmailServiceConfigured();

    const schema = z.object({
      fullName: z.string().trim().min(2),
      email: z.string().trim().email(),
      password: z.string().min(8),
      age: z.number().int().min(0).max(120).optional(),
      sex: z.string().trim().optional(),
      city: z.string().trim().optional(),
      assistantPersona: z.enum(ASSISTANT_PERSONAS).optional(),
    });

    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Donnees invalides.", details: parsed.error.flatten() });
    }

    const { fullName, email, password, age, sex, city, assistantPersona } = parsed.data;

    if (!fullName || !email || !password) {
      return res.status(400).json({
        error: "Les champs 'fullName', 'email' et 'password' sont requis.",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ error: "Cet email est deja utilise." });
    }

    const user = await prisma.user.create({
      data: {
        fullName: String(fullName).trim(),
        email: normalizedEmail,
        passwordHash: hashPassword(String(password)),
        role: "PATIENT",
        status: "ACTIVE",
        emailVerified: false,
      },
    });

    const patient = await prisma.patient.create({
      data: {
        userId: user.id,
        fullName: user.fullName,
        age: Number.isInteger(age) ? age : null,
        sex: typeof sex === "string" && sex.trim() ? sex.trim() : null,
        city: typeof city === "string" && city.trim() ? city.trim() : null,
        assistantPersona: normalizeAssistantPersona(assistantPersona),
      },
    });

    const conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        role: "PATIENT",
        title: "Conversation initiale",
      },
    });

    await sendVerificationEmail(user);

    return res.status(201).json({
      message: "Compte patient cree. Verifiez votre email avant de vous connecter.",
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
        patientId: patient.id,
        assistantPersona: patient.assistantPersona,
      },
      conversationId: conversation.id,
    });
  } catch (error) {
    return res.status(500).json({ error: "Erreur signup patient", details: error.message });
  }
}

/**
 * [Module: src/routes/auth.js] signupDoctor
 * Creates a doctor account in PENDING status and sends verification.
 */
async function signupDoctor(req, res) {
  try {
    ensureEmailServiceConfigured();

    const schema = z.object({
      fullName: z.string().trim().min(2),
      email: z.string().trim().email(),
      password: z.string().min(8),
      specialty: z.string().trim().min(2),
      licenseNumber: z.string().trim().min(2),
      yearsExperience: z.number().int().min(0).max(80).optional(),
      bio: z.string().trim().max(2000).optional(),
      clinicName: z.string().trim().max(120).optional(),
      clinicAddress: z.string().trim().max(200).optional(),
      clinicCity: z.string().trim().max(120).optional(),
      clinicLat: z.union([z.number(), z.string().trim()]).optional(),
      clinicLng: z.union([z.number(), z.string().trim()]).optional(),
    });

    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Donnees invalides.", details: parsed.error.flatten() });
    }

    const {
      fullName,
      email,
      password,
      specialty,
      licenseNumber,
      yearsExperience,
      bio,
      clinicName,
      clinicAddress,
      clinicCity,
      clinicLat,
      clinicLng,
    } = parsed.data;

    if (!fullName || !email || !password || !specialty || !licenseNumber) {
      return res.status(400).json({
        error:
          "Les champs 'fullName', 'email', 'password', 'specialty' et 'licenseNumber' sont requis.",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ error: "Cet email est deja utilise." });
    }

    const user = await prisma.user.create({
      data: {
        fullName: String(fullName).trim(),
        email: normalizedEmail,
        passwordHash: hashPassword(String(password)),
        role: "DOCTOR",
        status: "PENDING",
        emailVerified: false,
      },
    });

    const lat = clinicLat !== undefined ? Number(clinicLat) : null;
    const lng = clinicLng !== undefined ? Number(clinicLng) : null;

    await prisma.doctorProfile.create({
      data: {
        userId: user.id,
        specialty: String(specialty).trim(),
        licenseNumber: String(licenseNumber).trim(),
        yearsExperience: Number.isInteger(yearsExperience) ? yearsExperience : null,
        bio: typeof bio === "string" && bio.trim() ? bio.trim() : null,
        clinicName: typeof clinicName === "string" && clinicName.trim() ? clinicName.trim() : null,
        clinicAddress:
          typeof clinicAddress === "string" && clinicAddress.trim() ? clinicAddress.trim() : null,
        clinicCity: typeof clinicCity === "string" && clinicCity.trim() ? clinicCity.trim() : null,
        clinicLat: Number.isFinite(lat) ? lat : null,
        clinicLng: Number.isFinite(lng) ? lng : null,
      },
    });

    await sendVerificationEmail(user);

    return res.status(201).json({
      message:
        "Compte medecin cree. Verifiez votre email puis attendez la validation du superadmin.",
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Erreur signup medecin", details: error.message });
  }
}

/**
 * [Module: src/routes/auth.js] login
 * Authenticates a user and returns a JWT session.
 */
async function login(req, res) {
  try {
    const schema = z.object({
      email: z.string().trim().email(),
      password: z.string().min(1),
    });

    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Donnees invalides.", details: parsed.error.flatten() });
    }

    const { email, password } = parsed.data;

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { patientProfile: true, doctorProfile: true },
    });

    if (!user || !verifyPassword(user.passwordHash, String(password))) {
      return res.status(401).json({ error: "Identifiants invalides." });
    }

    if (!user.emailVerified && user.role !== "SUPERADMIN") {
      return res.status(403).json({
        error: "Email non verifie. Consultez votre boite mail puis confirmez votre compte.",
      });
    }

    if (user.status === "PENDING") {
      return res.status(403).json({
        error: "Compte en attente de validation par le superadmin.",
      });
    }

    if (user.status === "REJECTED") {
      return res.status(403).json({ error: "Compte rejete. Contactez l'administration." });
    }

    const token = issueSession(user);

    return res.json({
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
        patientId: user.patientProfile?.id || null,
        assistantPersona: user.patientProfile?.assistantPersona || "DOCTOR",
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Erreur login", details: error.message });
  }
}

/**
 * [Module: src/routes/auth.js] logout
 * Returns a success response; JWT invalidation is client-side.
 */
function logout(_req, res) {
  return res.json({ message: "Deconnexion effectuee (cote client)." });
}

/**
 * [Module: src/routes/auth.js] getMe
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
 * [Module: src/routes/auth.js] updateMe
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
 * [Module: src/routes/auth.js] changePassword
 * Updates the current user's password after verifying the current one.
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
 * [Module: src/routes/auth.js] deleteMe
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
 * [Module: src/routes/auth.js] requestVerification
 * Sends a new verification email if the account exists.
 */
async function requestVerification(req, res) {
  try {
    ensureEmailServiceConfigured();

    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: "Le champ 'email' est requis." });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (user && !user.emailVerified) {
      await sendVerificationEmail(user);
    }

    return res.json({
      message: "Si cet email existe, un lien de verification a ete envoye.",
    });
  } catch (error) {
    return res.status(500).json({ error: "Erreur envoi verification", details: error.message });
  }
}

/**
 * [Module: src/routes/auth.js] confirmVerification
 * Confirms an email verification token and activates the account.
 */
async function confirmVerification(req, res) {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) {
      return res.status(400).json({ error: "Le champ 'token' est requis." });
    }

    const tokenHash = sha256(token);
    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: "Token invalide ou expire." });
    }

    await prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: true },
    });

    await prisma.emailVerificationToken.deleteMany({ where: { userId: record.userId } });

    return res.json({ message: "Email verifie avec succes." });
  } catch (error) {
    return res.status(500).json({ error: "Erreur verification email", details: error.message });
  }
}

/**
 * [Module: src/routes/auth.js] forgotPassword
 * Sends a password reset email if the account exists.
 */
async function forgotPassword(req, res) {
  try {
    ensureEmailServiceConfigured();

    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: "Le champ 'email' est requis." });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await sendPasswordResetEmail(user);
    }

    return res.json({
      message: "Si cet email existe, un lien de reinitialisation a ete envoye.",
    });
  } catch (error) {
    return res.status(500).json({ error: "Erreur forgot password", details: error.message });
  }
}

/**
 * [Module: src/routes/auth.js] resetPassword
 * Resets a password using a valid reset token.
 */
async function resetPassword(req, res) {
  try {
    const token = String(req.body?.token || "").trim();
    const newPassword = String(req.body?.newPassword || "");

    if (!token || !newPassword) {
      return res.status(400).json({
        error: "Les champs 'token' et 'newPassword' sont requis.",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        error: "Le mot de passe doit contenir au moins 8 caracteres.",
      });
    }

    const tokenHash = sha256(token);
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: "Token invalide ou expire." });
    }

    await prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: hashPassword(newPassword) },
    });

    await prisma.passwordResetToken.deleteMany({ where: { userId: record.userId } });

    return res.json({ message: "Mot de passe reinitialise avec succes." });
  } catch (error) {
    return res.status(500).json({ error: "Erreur reset password", details: error.message });
  }
}

/**
 * [Module: src/routes/auth.js] createAuthRouter
 * Builds the authentication router with signup/login/reset flows.
 */
function createAuthRouter() {
  const router = express.Router();
  router.post("/signup/patient", authLimiter, signupPatient);
  router.post("/signup/doctor", authLimiter, signupDoctor);
  router.post("/login", authLimiter, login);
  router.post("/logout", authRequired, logout);
  router.get("/me", authRequired, getMe);
  router.patch("/me", authRequired, updateMe);
  router.post("/me/change-password", authRequired, changePassword);
  router.delete("/me", authRequired, deleteMe);
  router.post("/verify-email/request", requestVerification);
  router.post("/verify-email/confirm", confirmVerification);
  router.post("/forgot-password", forgotPassword);
  router.post("/reset-password", resetPassword);
  return router;
}

module.exports = { createAuthRouter };
