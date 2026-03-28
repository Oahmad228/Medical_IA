const { z } = require("zod");
const { prisma } = require("../../db/prisma");
const { issueSession } = require("../../middleware/auth");
const { ASSISTANT_PERSONAS } = require("../../config/env");
const { hashPassword, verifyPassword } = require("../../utils/crypto");
const { normalizeAssistantPersona } = require("../../utils/persona");
const { ensureEmailServiceConfigured, sendVerificationEmail } = require("../../services/emailService");

/**
 * [Module: src/routes/auth/authHandlers.js]
 * Gere l'inscription et l'authentification des comptes.
 */

/**
 * Inscrit un patient et envoie l'email de verification.
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
 * Inscrit un medecin et envoie l'email de verification.
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
 * Authentifie un utilisateur et retourne une session JWT.
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

    if (user.status === "BANNED") {
      return res.status(403).json({ error: "Compte banni. Contactez l'administration." });
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
 * Retourne un succes; l'invalidation JWT se fait cote client.
 */
function logout(_req, res) {
  return res.json({ message: "Deconnexion effectuee (cote client)." });
}

module.exports = { signupPatient, signupDoctor, login, logout };
