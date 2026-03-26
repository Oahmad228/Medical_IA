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
    });

    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Donnees invalides.", details: parsed.error.flatten() });
    }

    const { fullName, email, password, specialty, licenseNumber, yearsExperience, bio } =
      parsed.data;

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

    await prisma.doctorProfile.create({
      data: {
        userId: user.id,
        specialty: String(specialty).trim(),
        licenseNumber: String(licenseNumber).trim(),
        yearsExperience: Number.isInteger(yearsExperience) ? yearsExperience : null,
        bio: typeof bio === "string" && bio.trim() ? bio.trim() : null,
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
  router.post("/verify-email/request", requestVerification);
  router.post("/verify-email/confirm", confirmVerification);
  router.post("/forgot-password", forgotPassword);
  router.post("/reset-password", resetPassword);
  return router;
}

module.exports = { createAuthRouter };
