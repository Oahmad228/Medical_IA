const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const { PrismaClient } = require("@prisma/client");

dotenv.config({ override: true });

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 3001);
const AI_MODE = (process.env.AI_MODE || "mock").toLowerCase();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";
const LLM_PROVIDER = (process.env.LLM_PROVIDER || "openrouter").toLowerCase();
const LLM_API_KEY = process.env.LLM_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL || "meta-llama/llama-3.1-8b-instruct:free";
const LLM_BASE_URL =
  process.env.LLM_BASE_URL ||
  (LLM_PROVIDER === "groq"
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://openrouter.ai/api/v1/chat/completions");
const LLM_APP_NAME = process.env.LLM_APP_NAME || "Medical AI";
const LLM_APP_SITE = process.env.LLM_APP_SITE || "http://localhost:5173";

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || "Medical AI <no-reply@medical-ai.local>";
const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";
const EMAIL_TOKEN_TTL_MINUTES = Number(process.env.EMAIL_TOKEN_TTL_MINUTES || 30);
const ASSISTANT_PERSONAS = ["DOCTOR", "NURSE", "OWL", "RESCUE_DOG"];
const DOCTOR_PATIENT_OTP_TTL_MINUTES = Number(process.env.DOCTOR_PATIENT_OTP_TTL_MINUTES || 10);
const DOCTOR_PATIENT_OTP_MAX_ATTEMPTS = Number(process.env.DOCTOR_PATIENT_OTP_MAX_ATTEMPTS || 5);
// Step 1 requirement: once OTP is confirmed, the doctor-patient access stays valid for ~24h.
const DOCTOR_PATIENT_LINK_TTL_HOURS = Number(process.env.DOCTOR_PATIENT_LINK_TTL_HOURS || 24);

function getOtpTtlMinutes() {
  return DOCTOR_PATIENT_OTP_TTL_MINUTES > 0 ? DOCTOR_PATIENT_OTP_TTL_MINUTES : 10;
}

function getDoctorPatientActiveTtlExpiresAt() {
  const hours = DOCTOR_PATIENT_LINK_TTL_HOURS > 0 ? DOCTOR_PATIENT_LINK_TTL_HOURS : 24;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

const SUPERADMIN_EMAIL =
  (process.env.SUPERADMIN_EMAIL || "superadmin@medical-ai.local").toLowerCase();
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || "SuperAdmin123!";
const SUPERADMIN_NAME = process.env.SUPERADMIN_NAME || "Super Admin";

const mailTransporter =
  SMTP_HOST && SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      })
    : null;

const TRIAGE_RULES = {
  red: [
    {
      terms: [
        "douleur thorac",
        "douleur poitrine",
        "oppression thoracique",
        "essouff",
        "difficulte a respirer",
        "dyspnee",
      ],
      reason: "Possible urgence cardiaque ou respiratoire",
    },
    {
      terms: [
        "visage tombe",
        "paralysie visage",
        "difficulte a parler",
        "bras faible",
        "faiblesse brutale",
        "suspicion avc",
      ],
      reason: "Suspicion d'AVC (accident vasculaire cerebral)",
    },
    {
      terms: [
        "levres gonfl",
        "gonflement visage",
        "langue gonflee",
        "reaction allergique severe",
      ],
      reason: "Suspicion de reaction allergique severe",
    },
    {
      terms: ["saigne beaucoup", "hemorragie", "perte de sang importante"],
      reason: "Saignement important necessitant prise en charge urgente",
    },
  ],
  orange: [
    {
      terms: ["fievre", "temperature", "39", "38.5"],
      reason: "Fievre persistante ou elevee a surveiller",
    },
    {
      terms: ["douleur persistante", "douleur depuis", "douleur continue"],
      reason: "Douleur persistante qui merite une consultation",
    },
    {
      terms: ["infection", "pus", "inflammation", "frissons"],
      reason: "Signes possibles d'infection",
    },
  ],
};

const SPECIALIST_RULES = [
  { terms: ["coeur", "thorac", "palpitation"], specialist: "cardiologue" },
  {
    terms: ["peau", "rash", "eczema", "allergie cutanee"],
    specialist: "dermatologue",
  },
  { terms: ["gorge", "oreille", "nez", "sinus"], specialist: "ORL" },
  { terms: ["tete", "migraine", "vertige"], specialist: "neurologue" },
  {
    terms: ["ventre", "estomac", "nausee", "digestion"],
    specialist: "gastro-enterologue",
  },
];

function normalize(text) {
  return (text || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasAnyTerm(text, terms) {
  return terms.some((term) => text.includes(normalize(term)));
}

function hasAllTermGroups(text, groups) {
  return groups.every((group) => hasAnyTerm(text, group));
}

function isGreetingOnly(message) {
  const text = normalize(message).trim();
  if (!text) return false;

  const greetingTokens = [
    "bonjour",
    "bonsoir",
    "salut",
    "hello",
    "salam",
    "coucou",
    "bjr",
  ];

  const cleaned = text.replace(/[!?.,;:]/g, " ").replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ").filter(Boolean);

  return words.length <= 3 && words.every((w) => greetingTokens.includes(w));
}

function detectTriage(message) {
  const text = normalize(message);

  const emergencyTerms = [
    "je meurs",
    "je vais mourir",
    "je n arrive plus a respirer",
    "je ne peux plus respirer",
    "perte de connaissance",
    "inconscient",
  ];

  const bleedingTerms = [
    "saigne",
    "seigne",
    "saignement",
    "hemorragie",
    "hemoragie",
    "emoragie",
    "perte de sang",
  ];

  const weaknessTerms = [
    "faible",
    "faiblesse",
    "plus la force",
    "plus de force",
    "epuise",
    "je n arrive plus a marcher",
    "ne peux plus marcher",
  ];

  const pregnancyTerms = ["enceinte", "grossesse"];

  const persistentTerms = ["depuis une semaine", "1 semaine", "plusieurs jours"];
  const longDurationTerms = [
    "depuis",
    "jours",
    "jour",
    "semaine",
    "semaines",
    "24 jours",
    "continuellement",
    "continue",
    "continu",
    "en continu",
    "sans arret",
  ];
  const vomitingTerms = ["vomis", "vomissement", "je vomi", "je vomis", "nausee"];

  if (hasAnyTerm(text, emergencyTerms)) {
    return {
      triage: "RED",
      summary: "Declaration explicite de detresse vitale.",
      guidance:
        "Ceci peut etre une urgence medicale. Contactez les services d'urgence ou rendez-vous aux urgences immediatement.",
      nextStep: "Ne pas attendre. Prise en charge immediate.",
    };
  }

  if (hasAllTermGroups(text, [bleedingTerms, weaknessTerms])) {
    return {
      triage: "RED",
      summary: "Saignement associe a une faiblesse importante.",
      guidance:
        "Ceci peut etre une urgence medicale. Contactez les services d'urgence ou rendez-vous aux urgences immediatement.",
      nextStep: "Ne pas attendre. Prise en charge immediate.",
    };
  }

  if (hasAllTermGroups(text, [bleedingTerms, pregnancyTerms])) {
    return {
      triage: "RED",
      summary: "Saignement pendant une grossesse potentielle ou confirmee.",
      guidance:
        "Ceci peut etre une urgence obstetricale. Contactez les urgences immediatement.",
      nextStep: "Prise en charge obstetricale urgente.",
    };
  }

  if (hasAllTermGroups(text, [bleedingTerms, longDurationTerms])) {
    return {
      triage: "RED",
      summary: "Saignement continu ou prolonge signale.",
      guidance:
        "Ce tableau peut relever d'une urgence. Contactez les urgences ou consultez immediatement.",
      nextStep: "Evaluation medicale urgente sans attendre.",
    };
  }

  if (hasAllTermGroups(text, [persistentTerms, vomitingTerms])) {
    return {
      triage: "ORANGE",
      summary: "Vomissements persistants necessitant une evaluation rapide.",
      guidance:
        "Une consultation medicale est recommandee rapidement pour evaluer les risques de dehydration et de complication.",
      nextStep: "Prendre rendez-vous dans les 24 heures, ou plus tot si aggravation.",
    };
  }

  for (const rule of TRIAGE_RULES.red) {
    if (hasAnyTerm(text, rule.terms)) {
      return {
        triage: "RED",
        summary: rule.reason,
        guidance:
          "Ceci peut etre une urgence medicale. Contactez les services d'urgence ou rendez-vous aux urgences immediatement.",
        nextStep: "Ne pas attendre. Prise en charge immediate.",
      };
    }
  }

  for (const rule of TRIAGE_RULES.orange) {
    if (hasAnyTerm(text, rule.terms)) {
      return {
        triage: "ORANGE",
        summary: rule.reason,
        guidance:
          "Une consultation medicale est recommandee dans un delai raisonnable. Surveillez toute aggravation.",
        nextStep: "Prendre rendez-vous avec un medecin dans les 24 a 72 heures.",
      };
    }
  }

  return {
    triage: "GREEN",
    summary: "Aucun signe d'urgence immediate detecte.",
    guidance:
      "Repos, hydratation et surveillance des symptomes. Consulter si aggravation ou persistance.",
    nextStep: "Auto-surveillance et consultation si besoin.",
  };
}

function recommendSpecialist(message) {
  const text = normalize(message);

  for (const rule of SPECIALIST_RULES) {
    if (hasAnyTerm(text, rule.terms)) {
      return rule.specialist;
    }
  }

  return "medecin generaliste";
}

function deriveConversationTitleFromMessage(message, { maxLen = 56 } = {}) {
  const raw = String(message || "").trim();
  if (!raw) return "Nouvelle conversation";

  // Keep it simple + readable for UI list.
  const cleaned = raw
    .replace(/\s+/g, " ")
    .replace(/[\r\n\t]/g, " ")
    .replace(/[^\p{L}\p{N}\s'’,-]/gu, "")
    .trim();

  const snippet = cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1).trim()}…` : cleaned;
  return snippet || "Nouvelle conversation";
}

function isDefaultConversationTitle(title) {
  const t = String(title || "").trim().toLowerCase();
  return (
    t === "nouvelle discussion" ||
    t === "nouvelle discussion patient" ||
    t === "nouveau dossier clinique" ||
    t === "nouveau dossier"
  );
}

function getMockDoctors(specialist, near) {
  return [
    {
      name: `Cabinet ${specialist} Centre`,
      address: near ? `${near} - Centre` : "Centre-ville",
      phone: "+212 5 22 00 00 01",
      rating: 4.6,
    },
    {
      name: `Clinique ${specialist} Horizon`,
      address: near ? `${near} - Quartier Nord` : "Quartier Nord",
      phone: "+212 5 22 00 00 02",
      rating: 4.4,
    },
    {
      name: `Dr. ${specialist} Atlas`,
      address: near ? `${near} - Quartier Sud` : "Quartier Sud",
      phone: "+212 5 22 00 00 03",
      rating: 4.2,
    },
  ];
}

async function searchDoctorsFromGoogle({ specialist, near }) {
  const query = `${specialist} pres de ${near}`;

  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("type", "doctor");
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Places request failed (${response.status})`);
  }

  const payload = await response.json();
  if (payload.status !== "OK" && payload.status !== "ZERO_RESULTS") {
    throw new Error(`Google Places error: ${payload.status}`);
  }

  const results = Array.isArray(payload.results) ? payload.results : [];

  return results.slice(0, 5).map((doctor) => ({
    name: doctor.name || "Nom indisponible",
    address: doctor.formatted_address || "Adresse indisponible",
    phone: "Non fourni par cette route API",
    rating: doctor.rating || null,
  }));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto
    .createHash("sha256")
    .update(`${salt}:${password}`)
    .digest("hex");
  return `${salt}:${digest}`;
}

function verifyPassword(storedHash, password) {
  const [salt, digest] = String(storedHash || "").split(":");
  if (!salt || !digest) {
    return false;
  }

  const computed = crypto
    .createHash("sha256")
    .update(`${salt}:${password}`)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(computed));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function createRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

function tokenExpiryDate() {
  return new Date(Date.now() + EMAIL_TOKEN_TTL_MINUTES * 60 * 1000);
}

function normalizeAssistantPersona(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return ASSISTANT_PERSONAS.includes(normalized) ? normalized : "DOCTOR";
}

function assistantPersonaToStyle(persona) {
  const key = normalizeAssistantPersona(persona);
  if (key === "NURSE") {
    return "Ton d'infirmier: rassurant, orienté actions concrètes, patient et attentif.";
  }
  if (key === "OWL") {
    return "Ton hibou (OWL): pédagogique, encourage l'observation, explique simplement sans dramatiser.";
  }
  if (key === "RESCUE_DOG") {
    return "Ton chien de secours: protecteur, motivant, clair sur les gestes à faire en cas d'alerte.";
  }
  return "Ton docteur: empathique, prudent, et orienté vers les prochaines étapes.";
}

function isValidOtpCode(code) {
  const s = String(code || "").trim();
  return /^\d{4,6}$/.test(s);
}

function issueOtpCode() {
  // Always return 6 digits (easy to type).
  return String(crypto.randomInt(100000, 1000000));
}

function otpExpiryDate() {
  return new Date(Date.now() + getOtpTtlMinutes() * 60 * 1000);
}

function normalizeIncomingImageInputs(images) {
  if (!Array.isArray(images)) return [];
  return images
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .filter((v) => v.startsWith("data:image/") || /^https?:\/\//i.test(v))
    .slice(0, 3);
}

function withVisionUserMessage({ baseMessages, userText, imageInputs }) {
  const images = normalizeIncomingImageInputs(imageInputs);
  if (!images.length) return baseMessages;
  const userContent = [
    { type: "text", text: String(userText || "") },
    ...images.map((url) => ({ type: "image_url", image_url: { url } })),
  ];
  return [...baseMessages, { role: "user", content: userContent }];
}

async function sendEmail({ to, subject, text, html }) {
  if (!mailTransporter) {
    throw new Error(
      "SMTP non configure. Definissez SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM."
    );
  }

  await mailTransporter.sendMail({
    from: SMTP_FROM,
    to,
    subject,
    text,
    html,
  });
}

function ensureEmailServiceConfigured() {
  if (!mailTransporter) {
    throw new Error(
      "SMTP non configure. Definissez SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM."
    );
  }
}

async function issueEmailVerificationToken(userId) {
  await prisma.emailVerificationToken.deleteMany({ where: { userId } });
  const rawToken = createRawToken();
  const tokenHash = sha256(rawToken);
  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: tokenExpiryDate(),
    },
  });
  return rawToken;
}

async function issuePasswordResetToken(userId) {
  await prisma.passwordResetToken.deleteMany({ where: { userId } });
  const rawToken = createRawToken();
  const tokenHash = sha256(rawToken);
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: tokenExpiryDate(),
    },
  });
  return rawToken;
}

async function sendVerificationEmail(user) {
  const token = await issueEmailVerificationToken(user.id);
  const verifyLink = `${APP_BASE_URL}/verify-email?token=${token}`;

  await sendEmail({
    to: user.email,
    subject: "Verification de votre email - Medical AI",
    text: `Bonjour ${user.fullName},\n\nCliquez pour verifier votre email:\n${verifyLink}\n\nCe lien expire dans ${EMAIL_TOKEN_TTL_MINUTES} minutes.`,
    html: `<p>Bonjour ${user.fullName},</p><p>Cliquez pour verifier votre email:</p><p><a href="${verifyLink}">${verifyLink}</a></p><p>Ce lien expire dans ${EMAIL_TOKEN_TTL_MINUTES} minutes.</p>`,
  });
}

async function sendPasswordResetEmail(user) {
  const token = await issuePasswordResetToken(user.id);
  const resetLink = `${APP_BASE_URL}/reset-password?token=${token}`;

  await sendEmail({
    to: user.email,
    subject: "Reinitialisation du mot de passe - Medical AI",
    text: `Bonjour ${user.fullName},\n\nPour reinitialiser votre mot de passe, utilisez ce lien:\n${resetLink}\n\nCe lien expire dans ${EMAIL_TOKEN_TTL_MINUTES} minutes.`,
    html: `<p>Bonjour ${user.fullName},</p><p>Pour reinitialiser votre mot de passe, utilisez ce lien:</p><p><a href="${resetLink}">${resetLink}</a></p><p>Ce lien expire dans ${EMAIL_TOKEN_TTL_MINUTES} minutes.</p>`,
  });
}

function issueSession(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Token manquant." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.session = {
      id: Number(payload.sub),
      role: payload.role,
      email: payload.email,
      fullName: payload.fullName,
      status: payload.status,
    };
    req.token = token;
    return next();
  } catch (_error) {
    return res.status(401).json({ error: "Token invalide ou expire." });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session || req.session.role !== role) {
      return res.status(403).json({ error: "Acces refuse." });
    }
    return next();
  };
}

async function ensurePatientExists(patientId) {
  if (!patientId) {
    return null;
  }

  const patient = await prisma.patient.findUnique({ where: { id: Number(patientId) } });
  if (!patient) {
    throw new Error("Patient introuvable pour le patientId fourni.");
  }

  return patient;
}

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

async function getPatientForEmail(patientId) {
  const pId = Number(patientId);
  if (!Number.isInteger(pId) || pId <= 0) return null;
  return prisma.patient.findUnique({
    where: { id: pId },
    select: { id: true, user: { select: { email: true, fullName: true } }, fullName: true },
  });
}

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

function composePatientAssistantReply({ message, triage, specialist, doctors, patientPersona }) {
  if (isGreetingOnly(message)) {
    return [
      "Bonjour, je suis la pour vous aider (en douceur et avec prudence).",
      "Decrivez-moi ce que vous ressentez depuis quand, et ce qui aggrave ou soulage la douleur.",
      "Exemple: type de douleur, localisation, fievre, vomissements, saignement, grossesse, traitement deja pris.",
    ].join("\n\n");
  }

  const doctorsText =
    doctors.length === 0
      ? "Aucun medecin proche propose pour le moment (ajoutez une localisation)."
      : doctors
          .map(
            (d, index) =>
              `${index + 1}. ${d.name} - ${d.address}${d.rating ? ` (note ${d.rating})` : ""}`
          )
          .join("\n");

  const severityText =
    triage.triage === "RED"
      ? "Le niveau de preoccupation est eleve, il faut agir rapidement."
      : triage.triage === "ORANGE"
      ? "Le niveau de preoccupation est intermediaire et merite une consultation rapide."
      : "Le niveau de preoccupation est faible pour le moment, avec surveillance.";

  const explainedSummary = `${triage.summary}. En mots simples: cela signifie qu'il peut y avoir un probleme de sante a surveiller selon vos symptomes.`;
  const personaLine = patientPersona
    ? `Votre assistant (${normalizeAssistantPersona(patientPersona).replace(/_/g, " ").toLowerCase()}) vous guide pas a pas.`
    : "";

  const rendezVousLine =
    triage.triage === "RED" || triage.triage === "ORANGE"
      ? "Si vous le souhaitez, ajoutez votre localisation puis utilisez le bouton 'Rendez-vous' pour demarrer une consultation via l'app."
      : null;

  return [
    `Je comprends, merci pour votre message. ${severityText}`,
    personaLine,
    `Ce que j'ai compris: ${explainedSummary}`,
    `Ce que je vous conseille maintenant: ${triage.guidance} ${triage.nextStep}`,
    `Medecin a consulter en priorite: ${specialist}.`,
    rendezVousLine,
    `Options de praticiens: ${doctorsText}`,
    "Si vous voulez, je peux vous poser 3 questions courtes pour mieux preciser la situation.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function composeDoctorAssistantReply({ triage, clinicalSummary, hypotheses }) {
  return [
    `Niveau de vigilance estime: ${triage}`,
    `Synthese clinique: ${clinicalSummary}`,
    `Hypotheses:`,
    ...hypotheses.map((item, index) => `${index + 1}. ${item}`),
    "Rappel: la decision medicale finale appartient au medecin.",
  ].join("\n");
}

function extractAssistantText(chatPayload) {
  const raw = chatPayload?.choices?.[0]?.message?.content;
  if (typeof raw === "string") {
    return raw.trim();
  }
  if (Array.isArray(raw)) {
    return raw
      .map((item) => (typeof item?.text === "string" ? item.text : ""))
      .join("\n")
      .trim();
  }
  return "";
}

function mapStoredAuthorToLLMRole(author) {
  if (author === "ASSISTANT") return "assistant";
  if (author === "SYSTEM") return "system";
  return "user";
}

async function loadConversationHistoryForLLM(conversationId, { limit = 14 } = {}) {
  const conv = await prisma.conversation.findUnique({
    where: { id: Number(conversationId) },
    select: { summary: true, summaryMessageCount: true },
  });

  const total = await prisma.chatMessage.count({
    where: { conversationId: Number(conversationId) },
  });

  const summaryCount = Number(conv?.summaryMessageCount || 0);
  const skip = Math.max(summaryCount, total - limit);

  const rows = await prisma.chatMessage.findMany({
    where: { conversationId: Number(conversationId) },
    orderBy: { createdAt: "asc" },
    skip,
    take: limit,
  });

  const history = rows
    .filter((m) => typeof m?.content === "string" && m.content.trim())
    .map((m) => ({ role: mapStoredAuthorToLLMRole(m.author), content: m.content }));

  if (conv?.summary && typeof conv.summary === "string" && conv.summary.trim()) {
    return [
      {
        role: "system",
        content:
          "Resume de la conversation (memoire):\n" +
          conv.summary.trim() +
          "\n\nUtilise ce resume comme contexte, sans l'afficher tel quel.",
      },
      ...history,
    ];
  }

  return history;
}

async function maybeRefreshConversationSummary(conversationId) {
  const id = Number(conversationId);
  const conv = await prisma.conversation.findUnique({
    where: { id },
    select: { id: true, summaryMessageCount: true },
  });
  if (!conv) return;

  const total = await prisma.chatMessage.count({ where: { conversationId: id } });

  // Summarize once conversations get long, and only summarize older part.
  const minMessagesToSummarize = 40;
  const keepRecent = 18;
  const targetSummaryCount = Math.max(0, total - keepRecent);

  if (total < minMessagesToSummarize) return;
  if (Number(conv.summaryMessageCount || 0) >= targetSummaryCount) return;

  const toSummarize = await prisma.chatMessage.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
    take: targetSummaryCount,
  });

  const summarizerMessages = [
    {
      role: "system",
      content:
        "Tu es un module de memoire. Tu produis un resume court, factuel et utile d'une conversation medicale. " +
        "Inclure: symptomes, chronologie, facteurs aggravants/soulageants, reponses importantes, triage, prochaines etapes. " +
        "Ne pas inclure de donnees inutiles. 8-14 lignes maximum.",
    },
    ...toSummarize
      .filter((m) => typeof m?.content === "string" && m.content.trim())
      .map((m) => ({ role: mapStoredAuthorToLLMRole(m.author), content: m.content })),
  ];

  try {
    const summary = await callLLM({ messages: summarizerMessages, temperature: 0.1, maxTokens: 260 });
    await prisma.conversation.update({
      where: { id },
      data: {
        summary,
        summaryUpdatedAt: new Date(),
        summaryMessageCount: targetSummaryCount,
      },
    });
  } catch (_error) {
    // If summary fails, keep running without memory refresh.
  }
}

async function updatePatientMedicalMemory({ patientId, newUserMessage, newAssistantMessage, triageLevel }) {
  const id = Number(patientId);
  if (!Number.isInteger(id) || id <= 0) return;

  const patient = await prisma.patient.findUnique({
    where: { id },
    select: { id: true, medicalMemory: true, fullName: true, age: true, sex: true, city: true },
  });
  if (!patient) return;

  // If LLM isn't configured/live, keep a minimal deterministic memory.
  if (AI_MODE !== "live" || !LLM_API_KEY) {
    const stamp = new Date().toLocaleString();
    const prev = patient.medicalMemory ? `${patient.medicalMemory}\n` : "";
    const next = `${prev}- ${stamp} | triage=${triageLevel || "N/A"} | ${String(newUserMessage || "").trim()}`;
    await prisma.patient.update({
      where: { id },
      data: { medicalMemory: next.slice(-8000), medicalMemoryUpdatedAt: new Date() },
    });
    return;
  }

  const summarizerMessages = [
    {
      role: "system",
      content:
        "Tu es la memoire clinique persistante d'un agent medical. Tu maintiens un 'rapport medical' compact et utile sur un patient. " +
        "Objectif: aider les futures conversations. " +
        "Contraintes: pas de diagnostic certain, pas de speculation inutile. " +
        "Format STRICT en sections courtes:\n" +
        "1) Profil\n2) Antecedents/Contexte\n3) Symptomes recents (timeline)\n4) Triage et red flags\n5) Actions/Conseils donnes\n6) Questions ouvertes\n" +
        "Max 16 lignes. Pas de donnees privees inutiles.",
    },
    {
      role: "user",
      content: [
        `Profil connu: nom=${patient.fullName}, age=${patient.age ?? "N/A"}, sexe=${patient.sex ?? "N/A"}, ville=${patient.city ?? "N/A"}`,
        `Memoire actuelle (si presente):\n${patient.medicalMemory || "(vide)"}`,
        `Nouveau message patient:\n${String(newUserMessage || "").trim()}`,
        `Nouvelle reponse assistant:\n${String(newAssistantMessage || "").trim()}`,
        `Triage associe: ${triageLevel || "N/A"}`,
        "Mets a jour la memoire (remplacer/ameliorer), sans repetition inutile.",
      ].join("\n\n"),
    },
  ];

  try {
    const updated = await callLLM({ messages: summarizerMessages, temperature: 0.15, maxTokens: 320 });
    await prisma.patient.update({
      where: { id },
      data: { medicalMemory: updated, medicalMemoryUpdatedAt: new Date() },
    });
  } catch (_e) {
    // best-effort
  }
}

async function callLLM({
  systemPrompt,
  userPrompt,
  messages,
  temperature = 0.3,
  maxTokens = 500,
}) {
  if (!LLM_API_KEY) {
    throw new Error(
      "LLM_API_KEY manquant. Configurez une cle OpenRouter ou Groq dans backend/.env."
    );
  }

  const headers = {
    Authorization: `Bearer ${LLM_API_KEY}`,
    "Content-Type": "application/json",
  };

  if (LLM_PROVIDER === "openrouter") {
    headers["HTTP-Referer"] = LLM_APP_SITE;
    headers["X-OpenRouter-Title"] = LLM_APP_NAME;
    headers["X-Title"] = LLM_APP_NAME;
  }

  const response = await fetch(LLM_BASE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: LLM_MODEL,
      messages:
        Array.isArray(messages) && messages.length > 0
          ? messages
          : [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Erreur API LLM (${response.status})`);
  }

  const content = extractAssistantText(payload);
  if (!content) {
    throw new Error("Reponse LLM vide");
  }

  return content;
}

async function callLLMStream({ messages, temperature = 0.3, maxTokens = 500, onDelta }) {
  if (!LLM_API_KEY) {
    throw new Error(
      "LLM_API_KEY manquant. Configurez une cle OpenRouter ou Groq dans backend/.env."
    );
  }

  const headers = {
    Authorization: `Bearer ${LLM_API_KEY}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };

  if (LLM_PROVIDER === "openrouter") {
    headers["HTTP-Referer"] = LLM_APP_SITE;
    headers["X-OpenRouter-Title"] = LLM_APP_NAME;
    headers["X-Title"] = LLM_APP_NAME;
  }

  const response = await fetch(LLM_BASE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error?.message || `Erreur API LLM (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";

  function pushDelta(text) {
    if (!text) return;
    fullText += text;
    if (typeof onDelta === "function") onDelta(text);
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // OpenAI-compatible streaming is SSE: "data: {...}\n\n"
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      const lines = chunk.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data) continue;
        if (data === "[DONE]") {
          return fullText;
        }
        try {
          const json = JSON.parse(data);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) {
            pushDelta(delta);
          }
        } catch (_e) {
          // ignore non-JSON data lines
        }
      }
    }
  }

  return fullText;
}

async function generatePatientAssistantText({
  message,
  triage,
  specialist,
  doctors,
  historyMessages,
  patientContext,
  imageInputs,
}) {
  if (isGreetingOnly(message)) {
    return [
      "Bonjour, je suis la pour vous accompagner.",
      "Decrivez simplement vos symptomes avec vos mots: ou vous avez mal, depuis quand, et si cela s'aggrave.",
      "Je vous repondrai comme un entretien medical progressif, en langage clair.",
    ].join("\n\n");
  }

  const doctorsText =
    doctors.length === 0
      ? "Aucun praticien local trouve actuellement."
      : doctors
          .map(
            (d, index) =>
              `${index + 1}. ${d.name} - ${d.address}${d.rating ? ` (note ${d.rating})` : ""}`
          )
          .join("\n");

  const safePatientContext =
    patientContext && typeof patientContext === "object"
      ? [
          `Contexte patient (si connu): age=${patientContext.age ?? "N/A"}, sexe=${patientContext.sex ?? "N/A"}, ville=${patientContext.city ?? "N/A"}`,
          patientContext.medicalMemory
            ? `Memoire medicale persistante (contexte):\n${String(patientContext.medicalMemory).slice(0, 5500)}`
            : "Memoire medicale persistante: (vide)",
          `Persona assistant patient: ${normalizeAssistantPersona(patientContext.assistantPersona || "DOCTOR")}`,
        ].join("\n")
      : [
          "Contexte patient: non disponible.",
          "Memoire medicale persistante: (vide)",
          "Persona assistant patient: DOCTOR",
        ].join("\n");

  const systemPrompt =
    "Tu es l'Agent IA Patient d'une plateforme medicale. Objectif: conversation naturelle, empathique et utile, tout en restant prudent. " +
    "Tu ne poses pas de diagnostic. Tu expliques en mots simples. Tu poses 1 a 3 questions courtes si des infos manquent. " +
    "Si le triage est RED, tu recommandes explicitement d'aller aux urgences immediatement. " +
    "Si le triage est ORANGE ou RED, tu proposes explicitement la fonctionnalite 'Rendez-vous' dans l'app (le patient renseigne sa localisation puis demande une consultation). " +
    `Style: ${assistantPersonaToStyle(patientContext?.assistantPersona || "DOCTOR")}`;

  const triageContext = [
    safePatientContext,
    `Triage calcule pour le dernier message: ${triage.triage}`,
    `Synthese: ${triage.summary}`,
    `Conseil securite: ${triage.guidance}`,
    `Prochaine etape: ${triage.nextStep}`,
    `Specialiste recommande: ${specialist}`,
    `Praticiens trouves:\n${doctorsText}`,
    "Consignes de style: reponse courte au debut (2-4 phrases), puis details si utile. Evite les listes trop rigides.",
  ].join("\n");

  const baseMessages = buildPatientAgentMessages({ systemPrompt, historyMessages, triageContext });
  const messages = withVisionUserMessage({
    baseMessages,
    userText:
      "Le patient vient d'envoyer des images. Analyse-les avec prudence, sans diagnostic certain, puis reponds.",
    imageInputs,
  });
  return callLLM({ messages, temperature: 0.25, maxTokens: 520 });
}

function buildPatientAgentMessages({ systemPrompt, historyMessages, triageContext }) {
  return [
    { role: "system", content: systemPrompt },
    ...(Array.isArray(historyMessages) ? historyMessages : []),
    { role: "system", content: triageContext },
  ];
}

function buildDoctorAgentMessages({ systemPrompt, historyMessages, clinicalContext }) {
  return [
    { role: "system", content: systemPrompt },
    ...(Array.isArray(historyMessages) ? historyMessages : []),
    { role: "system", content: clinicalContext },
  ];
}

async function generateDoctorAssistantText({
  message,
  triage,
  hypotheses,
  historyMessages,
  imageInputs,
  patientLocation,
  patientTriageLevel,
  patientTriageSummary,
  patientSpecialist,
}) {
  const systemPrompt =
    "Tu es l'Agent IA Medecin (assistant clinique). Conversation naturelle, concise, actionnable. " +
    "Pas de certitude diagnostique. Mets en avant les red flags et les infos manquantes. " +
    "Termine par 2-4 questions de clarification si necessaire.";

  const clinicalContext = [
    `Niveau de vigilance calcule: ${triage}`,
    `Hypotheses preliminaires (regles): ${hypotheses.join(" | ")}`,
    `Localisation patient (dernier triage): ${patientLocation || "N/A"}`,
    `Triage patient (dernier): ${patientTriageLevel || "N/A"} | resume=${patientTriageSummary || "N/A"}`,
    `Specialiste probable (dernier triage patient): ${patientSpecialist || "N/A"}`,
    `Dernier message: ${message}`,
    "Format prefere (court): Synthese / Hypotheses / A verifier / Message patient (simple).",
  ].join("\n");

  const baseMessages = buildDoctorAgentMessages({ systemPrompt, historyMessages, clinicalContext });
  const messages = withVisionUserMessage({
    baseMessages,
    userText:
      "Des images cliniques ont ete jointes au message. Prends-les en compte avec prudence.",
    imageInputs,
  });
  return callLLM({ messages, temperature: 0.2, maxTokens: 650 });
}

// Step 1 (MVP): after OTP confirmation, prepare a first DRAFT report automatically.
async function ensureDraftReportExistsForDoctorPatient({ doctorUserId, patientId }) {
  const dId = Number(doctorUserId);
  const pId = Number(patientId);
  if (!Number.isInteger(dId) || !Number.isInteger(pId) || pId <= 0) return null;

  const existing = await prisma.patientReport.findFirst({
    where: { doctorUserId: dId, patientId: pId, status: "DRAFT" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const lastSymptom = await prisma.symptomReport.findFirst({
    where: { patientId: pId },
    orderBy: { createdAt: "desc" },
    select: {
      message: true,
      location: true,
      triageLevel: true,
      triageSummary: true,
      guidance: true,
      nextStep: true,
      specialist: true,
    },
  });
  if (!lastSymptom) {
    // No symptom info => cannot generate a draft.
    return null;
  }

  const triageLevel = lastSymptom.triageLevel;
  const triageSummary = lastSymptom.triageSummary;
  const guidance = lastSymptom.guidance;
  const nextStep = lastSymptom.nextStep;
  const specialist = lastSymptom.specialist;

  const hypotheses =
    triageLevel === "RED"
      ? ["Cas potentiellement critique a evaluer immediatement", "Verifier constantes vitales et protocoles d'urgence"]
      : triageLevel === "ORANGE"
      ? ["Consultation et examen clinique recommandes", "Approfondir bilan etiologique"]
      : ["Tableau potentiellement benin selon les donnees fournies", "Surveillance et reevaluation si aggravation"];

  const clinicalSummary = `Analyse clinique du message: ${lastSymptom.message}`;

  let doctorDraftText = "";
  try {
    doctorDraftText = await generateDoctorAssistantText({
      message: lastSymptom.message,
      triage: triageLevel,
      hypotheses,
      historyMessages: [],
      imageInputs: [],
      patientLocation: lastSymptom.location || null,
      patientTriageLevel: lastSymptom.triageLevel || null,
      patientTriageSummary: lastSymptom.triageSummary || null,
      patientSpecialist: lastSymptom.specialist || null,
    });
  } catch (_e) {
    // Fallback concise if AI isn't available.
    doctorDraftText = composeDoctorAssistantReply({ triage: triageLevel, clinicalSummary, hypotheses });
  }

  await prisma.patientReport.create({
    data: {
      patientId: pId,
      doctorUserId: dId,
      status: "DRAFT",
      triageLevel,
      triageSummary,
      guidance,
      nextStep,
      specialist,
      doctorDraftText,
    },
  });

  return null;
}

async function generatePatientReportFromDoctor({
  patient,
  doctorDraftText,
  triageLevel,
  triageSummary,
  guidance,
  nextStep,
  specialist,
}) {
  const persona = patient?.assistantPersona || "DOCTOR";
  const patientStyle = assistantPersonaToStyle(persona);

  const systemPrompt =
    "Tu es l'IA Patient. Tu transformes un rapport clinique provisoire en explication patient-friendly, prudente, non diagnostique. " +
    "Tu dois garder un ton rassurant et orienter vers des actions concretes. " +
    "Contraintes: pas de diagnostic certain, pas de speculation dangereuse. " +
    "Structure REQUISE: (1) Resume en mots simples (2) Signaux a surveiller (3) Que faire maintenant (4) Prochain contact (si applicable). " +
    `Style: ${patientStyle}`;

  const userPrompt = [
    `Patient: nom=${patient?.fullName || "N/A"}, age=${patient?.age ?? "N/A"}, sexe=${patient?.sex ?? "N/A"}, ville=${patient?.city ?? "N/A"}`,
    `Memoire medicale persistante (contexte interne):\n${patient?.medicalMemory || "(vide)"}`,
    `Triage: niveau=${triageLevel || "N/A"} | resume=${triageSummary || "N/A"}`,
    `Guidance securite: ${guidance || ""}`,
    `Next step: ${nextStep || ""}`,
    `Specialiste probable: ${specialist || ""}`,
    `Texte clinique du medecin (draft):\n${doctorDraftText || ""}`,
    "Redige une version finale pour le patient. La memoire medicale est un contexte, ne la recopie pas mot pour mot.",
  ].join("\n\n");

  // Best effort: cap tokens because patient text should be short and readable.
  return callLLM({ systemPrompt, userPrompt: userPrompt, temperature: 0.25, maxTokens: 520 });
}

app.get("/", (_req, res) => {
  res.json({
    service: "medical-ai-backend",
    message: "API operationnelle",
    database: "SQLite via Prisma",
    endpoints: [
      "POST /auth/signup/patient",
      "POST /auth/signup/doctor",
      "POST /auth/login",
      "POST /auth/logout",
      "GET /health",
      "GET /chat/conversations",
      "POST /chat/conversations",
      "GET /chat/conversations/:id/messages",
      "POST /chat/conversations/:id/messages",
      "DELETE /chat/conversations/:id",
      "GET /admin/doctor-requests",
      "POST /admin/doctor-requests/:userId/approve",
      "POST /admin/doctor-requests/:userId/reject",
    ],
  });
});

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({
      status: "ok",
      service: "medical-ai-backend",
      aiMode: AI_MODE,
      llmProvider: LLM_PROVIDER,
      llmConfigured: Boolean(LLM_API_KEY),
      llmModel: LLM_MODEL,
      database: "connected",
      databaseEngine: "SQLite (Prisma)",
    });
  } catch (_error) {
    return res.status(500).json({
      status: "error",
      service: "medical-ai-backend",
      aiMode: AI_MODE,
      llmProvider: LLM_PROVIDER,
      llmConfigured: Boolean(LLM_API_KEY),
      llmModel: LLM_MODEL,
      database: "disconnected",
      databaseEngine: "SQLite (Prisma)",
    });
  }
});

app.post("/auth/signup/patient", authLimiter, async (req, res) => {
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
      message:
        "Compte patient cree. Verifiez votre email avant de vous connecter.",
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
});

app.post("/auth/signup/doctor", authLimiter, async (req, res) => {
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
});

app.post("/auth/login", authLimiter, async (req, res) => {
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
        error:
          "Email non verifie. Consultez votre boite mail puis confirmez votre compte.",
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
});

app.post("/auth/logout", authRequired, (req, res) => {
  // JWT is stateless; client should delete its token.
  return res.json({ message: "Deconnexion effectuee (cote client)." });
});

app.post("/auth/verify-email/request", async (req, res) => {
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
      message:
        "Si cet email existe, un lien de verification a ete envoye.",
    });
  } catch (error) {
    return res.status(500).json({ error: "Erreur envoi verification", details: error.message });
  }
});

app.post("/auth/verify-email/confirm", async (req, res) => {
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
});

app.post("/auth/forgot-password", async (req, res) => {
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
      message:
        "Si cet email existe, un lien de reinitialisation a ete envoye.",
    });
  } catch (error) {
    return res.status(500).json({ error: "Erreur forgot password", details: error.message });
  }
});

app.post("/auth/reset-password", async (req, res) => {
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
});

app.get("/admin/doctor-requests", authRequired, requireRole("SUPERADMIN"), async (req, res) => {
  try {
    const status = String(req.query.status || "PENDING").toUpperCase();

    const requests = await prisma.user.findMany({
      where: {
        role: "DOCTOR",
        status: ["PENDING", "ACTIVE", "REJECTED"].includes(status)
          ? status
          : "PENDING",
      },
      include: { doctorProfile: true },
      orderBy: { createdAt: "desc" },
    });

    return res.json(requests);
  } catch (error) {
    return res.status(500).json({ error: "Erreur lecture demandes", details: error.message });
  }
});

app.post(
  "/admin/doctor-requests/:userId/approve",
  authRequired,
  requireRole("SUPERADMIN"),
  async (req, res) => {
    try {
      const userId = Number(req.params.userId);
      const note = typeof req.body?.note === "string" ? req.body.note.trim() : null;

      const target = await prisma.user.findUnique({
        where: { id: userId },
        include: { doctorProfile: true },
      });

      if (!target || target.role !== "DOCTOR") {
        return res.status(404).json({ error: "Compte medecin introuvable." });
      }

      await prisma.user.update({
        where: { id: userId },
        data: { status: "ACTIVE" },
      });

      if (target.doctorProfile) {
        await prisma.doctorProfile.update({
          where: { userId },
          data: {
            reviewedById: req.session.id,
            approvalNote: note,
            approvedAt: new Date(),
          },
        });
      }

      return res.json({ message: "Compte medecin valide avec succes." });
    } catch (error) {
      return res.status(500).json({ error: "Erreur validation", details: error.message });
    }
  }
);

app.post(
  "/admin/doctor-requests/:userId/reject",
  authRequired,
  requireRole("SUPERADMIN"),
  async (req, res) => {
    try {
      const userId = Number(req.params.userId);
      const note = typeof req.body?.note === "string" ? req.body.note.trim() : null;

      const target = await prisma.user.findUnique({
        where: { id: userId },
        include: { doctorProfile: true },
      });

      if (!target || target.role !== "DOCTOR") {
        return res.status(404).json({ error: "Compte medecin introuvable." });
      }

      await prisma.user.update({
        where: { id: userId },
        data: { status: "REJECTED" },
      });

      if (target.doctorProfile) {
        await prisma.doctorProfile.update({
          where: { userId },
          data: {
            reviewedById: req.session.id,
            approvalNote: note,
            approvedAt: null,
          },
        });
      }

      return res.json({ message: "Compte medecin rejete." });
    } catch (error) {
      return res.status(500).json({ error: "Erreur rejet", details: error.message });
    }
  }
);

app.get("/chat/conversations", authRequired, async (req, res) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: { userId: req.session.id },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return res.json(conversations);
  } catch (error) {
    return res.status(500).json({ error: "Erreur lecture conversations", details: error.message });
  }
});

app.post("/chat/conversations", authRequired, async (req, res) => {
  try {
    const title =
      typeof req.body?.title === "string" && req.body.title.trim()
        ? req.body.title.trim()
        : req.session.role === "DOCTOR"
        ? "Nouveau dossier clinique"
        : "Nouvelle discussion";

    const patientIdRaw = req.body?.patientId;
    let patientId = null;
    let lockedUntil = null;

    if (req.session.role === "DOCTOR" && patientIdRaw !== undefined && patientIdRaw !== null) {
      const parsedPid = Number(patientIdRaw);
      if (!Number.isInteger(parsedPid) || parsedPid <= 0) {
        return res.status(400).json({ error: "patientId invalide." });
      }

      const linkOk = await prisma.doctorPatientLink.findFirst({
        where: {
          doctorUserId: req.session.id,
          patientId: parsedPid,
          status: "ACTIVE",
          expiresAt: { gt: new Date() },
        },
        select: { expiresAt: true },
      });

      if (!linkOk) {
        return res.status(403).json({ error: "Acces refuse. OTP requis/expire." });
      }

      patientId = parsedPid;
      lockedUntil = linkOk.expiresAt;
    }

    const conversation = await prisma.conversation.create({
      data: {
        userId: req.session.id,
        role: req.session.role === "DOCTOR" ? "DOCTOR" : "PATIENT",
        title,
        patientId,
        lockedUntil,
      },
    });

    return res.status(201).json(conversation);
  } catch (error) {
    return res.status(500).json({ error: "Erreur creation conversation", details: error.message });
  }
});

app.get("/chat/conversations/:id/messages", authRequired, async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!conversation || conversation.userId !== req.session.id) {
      return res.status(404).json({ error: "Conversation introuvable." });
    }

    if (req.session.role === "DOCTOR" && !conversation.patientId) {
      // Confidentiality: if a doctor conversation isn't locked to a patient yet,
      // we deny access once it has any historical messages.
      const existingCount = await prisma.chatMessage.count({ where: { conversationId } });
      if (existingCount > 0) {
        return res.status(403).json({
          error: "Conversation non verrouillee. Creer une nouvelle conversation pour chaque patient.",
        });
      }
    }

    if (req.session.role === "DOCTOR" && conversation.patientId) {
      if (conversation.lockedUntil && conversation.lockedUntil <= new Date()) {
        return res.status(403).json({ error: "Acces refuse. Consultation expiree." });
      }
      const linkOk = await ensureDoctorHasActiveLink({
        doctorUserId: req.session.id,
        patientId: conversation.patientId,
      });
      if (!linkOk) {
        return res.status(403).json({ error: "Acces refuse. OTP requis/expire." });
      }
    }

    return res.json(conversation);
  } catch (error) {
    return res.status(500).json({ error: "Erreur lecture messages", details: error.message });
  }
});

app.delete("/chat/conversations/:id", authRequired, async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return res.status(400).json({ error: "ID conversation invalide." });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, userId: true },
    });

    if (!conversation || conversation.userId !== req.session.id) {
      return res.status(404).json({ error: "Conversation introuvable." });
    }

    await prisma.chatMessage.deleteMany({ where: { conversationId } });
    await prisma.conversation.delete({ where: { id: conversationId } });

    return res.json({ message: "Conversation supprimee.", id: conversationId });
  } catch (error) {
    return res.status(500).json({ error: "Erreur suppression conversation", details: error.message });
  }
});

app.post("/chat/conversations/:id/messages", chatLimiter, authRequired, async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    const streamRequested = String(req.query.stream || "") === "1";

    const schema = z.object({
      message: z.string().trim().min(1).max(6000),
      location: z.string().trim().max(200).optional(),
      patientId: z.union([z.number().int().positive(), z.string().trim()]).optional(),
      images: z.array(z.string().trim().min(1)).max(3).optional(),
    });

    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Donnees invalides.", details: parsed.error.flatten() });
    }

    const message = parsed.data.message;
    const location =
      typeof parsed.data.location === "string" && parsed.data.location.trim()
        ? parsed.data.location.trim()
        : null;
    const patientIdRaw = parsed.data.patientId;
    const imageInputs = normalizeIncomingImageInputs(parsed.data.images);
    const patientId =
      patientIdRaw !== undefined && String(patientIdRaw).trim()
        ? Number(String(patientIdRaw).trim())
        : null;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { user: { include: { patientProfile: true } } },
    });

    if (!conversation || conversation.userId !== req.session.id) {
      return res.status(404).json({ error: "Conversation introuvable." });
    }

    if (req.session.role === "DOCTOR") {
      const now = new Date();
      const linkedPatientId = patientId;

      if (conversation.lockedUntil && conversation.lockedUntil <= now) {
        return res.status(403).json({ error: "Acces refuse. Consultation expiree." });
      }

      if (conversation.patientId) {
        if (!linkedPatientId || linkedPatientId !== conversation.patientId) {
          return res
            .status(403)
            .json({ error: "Conversation verrouillee pour un autre patient. Creer une nouvelle conversation." });
        }
      } else {
        // Prevent historical mixing: if the thread isn't locked yet but already contains messages,
        // we refuse and ask the doctor to create a new conversation.
        const existingCount = await prisma.chatMessage.count({ where: { conversationId } });
        if (existingCount > 0) {
          return res.status(403).json({
            error: "Conversation non verrouillee et deja utilisee. Creer une nouvelle conversation pour ce patient.",
          });
        }

        if (!linkedPatientId) {
          return res.status(400).json({ error: "patientId requis pour analyse medecin (OTP obligatoire)." });
        }

        const link = await prisma.doctorPatientLink.findFirst({
          where: { doctorUserId: req.session.id, patientId: linkedPatientId, status: "ACTIVE", expiresAt: { gt: now } },
          select: { expiresAt: true },
        });
        if (!link) {
          return res.status(403).json({ error: "Patient non autorise pour ce medecin. Realisez l'association via OTP." });
        }

        await prisma.conversation.update({
          where: { id: conversationId },
          data: {
            patientId: linkedPatientId,
            lockedUntil: link.expiresAt || null,
          },
        });
      }
    }

    await prisma.chatMessage.create({
      data: {
        conversationId,
        author: "USER",
        content: message,
      },
    });

    // Auto-title conversations on first user message (if still default title).
    try {
      const msgCount = await prisma.chatMessage.count({ where: { conversationId } });
      if (msgCount <= 1 && isDefaultConversationTitle(conversation.title)) {
        const nextTitle = deriveConversationTitleFromMessage(message);
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { title: nextTitle },
        });
        conversation.title = nextTitle;
      }
    } catch (_e) {
      // best-effort title generation
    }

    // Update memory (summary) opportunistically (best-effort).
    maybeRefreshConversationSummary(conversationId).catch(() => {});

    let assistantText = "";
    let triageLevel = null;
    let aiFallbackUsed = false;

    if (req.session.role !== "DOCTOR") {
      const triage = detectTriage(message);
      const specialist = recommendSpecialist(message);
      let doctors = [];

      if (location) {
        if (AI_MODE === "live" && GOOGLE_MAPS_API_KEY) {
          try {
            doctors = await searchDoctorsFromGoogle({
              specialist,
              near: location,
            });
          } catch (_error) {
            doctors = [];
          }
        }
      }

      triageLevel = triage.triage;
      try {
        const historyMessages = await loadConversationHistoryForLLM(conversationId, { limit: 18 });
        const patientProfile = conversation.user?.patientProfile || null;
        const patientContext = patientProfile
          ? {
              age: patientProfile.age,
              sex: patientProfile.sex,
              city: patientProfile.city,
              medicalMemory: patientProfile.medicalMemory,
              assistantPersona: patientProfile.assistantPersona,
            }
          : null;

        if (streamRequested) {
          if (AI_MODE !== "live") {
            return res
              .status(400)
              .json({ error: "Streaming indisponible en mode mock. Activez AI_MODE=live." });
          }
          if (!LLM_API_KEY) {
            return res.status(400).json({
              error: "Streaming indisponible sans LLM_API_KEY. Configurez backend/.env.",
            });
          }

          res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache, no-transform");
          res.setHeader("Connection", "keep-alive");
          res.flushHeaders?.();

          res.write(`data: ${JSON.stringify({ type: "meta", triageLevel })}\n\n`);

          const doctorsText =
            doctors.length === 0
              ? "Aucun praticien local trouve actuellement."
              : doctors
                  .map(
                    (d, index) =>
                      `${index + 1}. ${d.name} - ${d.address}${d.rating ? ` (note ${d.rating})` : ""}`
                  )
                  .join("\n");

          const safePatientContext =
            patientContext && typeof patientContext === "object"
              ? [
                  `Contexte patient (si connu): age=${patientContext.age ?? "N/A"}, sexe=${patientContext.sex ?? "N/A"}, ville=${patientContext.city ?? "N/A"}`,
                  patientContext.medicalMemory
                    ? `Memoire medicale persistante:\n${patientContext.medicalMemory}`
                    : "Memoire medicale persistante: (vide)",
                  `Persona assistant patient: ${normalizeAssistantPersona(
                    patientContext.assistantPersona || "DOCTOR"
                  )}`,
                ].join("\n")
              : "Contexte patient: non disponible.";

          const systemPrompt =
            "Tu es l'Agent IA Patient d'une plateforme medicale. Objectif: conversation naturelle, empathique et utile, tout en restant prudent. " +
            "Tu ne poses pas de diagnostic. Tu expliques en mots simples. Tu poses 1 a 3 questions courtes si des infos manquent. " +
            "Si le triage est RED, tu recommandes explicitement d'aller aux urgences immediatement. " +
            "Si le triage est ORANGE ou RED, tu proposes explicitement la fonctionnalite 'Rendez-vous' dans l'app (ajouter localisation puis demande de consultation).";

          const triageContext = [
            safePatientContext,
            `Triage calcule pour le dernier message: ${triage.triage}`,
            `Synthese: ${triage.summary}`,
            `Conseil securite: ${triage.guidance}`,
            `Prochaine etape: ${triage.nextStep}`,
            `Specialiste recommande: ${specialist}`,
            `Praticiens trouves:\n${doctorsText}`,
            `Style: ${assistantPersonaToStyle(patientContext?.assistantPersona || "DOCTOR")}`,
            "Consignes de style: reponse courte au debut (2-4 phrases), puis details si utile. Evite les listes trop rigides.",
          ].join("\n");

          const llmMessages = buildPatientAgentMessages({
            systemPrompt,
            historyMessages,
            triageContext,
          });
          const llmMessagesWithImages = withVisionUserMessage({
            baseMessages: llmMessages,
            userText:
              "Le patient a ajoute des images a ce message. Prends-les en compte avec prudence.",
            imageInputs,
          });

          assistantText = await callLLMStream({
            messages: llmMessagesWithImages,
            temperature: 0.25,
            maxTokens: 520,
            onDelta: (delta) => {
              res.write(`data: ${JSON.stringify({ type: "delta", delta })}\n\n`);
            },
          });

          res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
          res.end();
        } else {
          assistantText = await generatePatientAssistantText({
            message,
            triage,
            specialist,
            doctors,
            historyMessages,
            patientContext,
            imageInputs,
          });
        }
      } catch (error) {
        aiFallbackUsed = true;
        const reason = String(error?.message || "").includes("429")
          ? "Quota/limite OpenRouter atteinte (HTTP 429)."
          : "Service IA externe indisponible.";
        assistantText = composePatientAssistantReply({
          message,
          triage,
          specialist,
          doctors,
          patientPersona: patientContext?.assistantPersona,
        });
        assistantText += `\n\n[Info technique] ${reason} Reponse de secours activee.`;

        if (streamRequested && res.headersSent) {
          res.write(`data: ${JSON.stringify({ type: "delta", delta: assistantText })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: "done", aiFallbackUsed: true })}\n\n`);
          res.end();
        }
      }

      const linkedPatientId =
        Number.isInteger(Number(patientId)) && Number(patientId) > 0
          ? Number(patientId)
          : conversation.user.patientProfile?.id || null;

      if (linkedPatientId) {
        await ensurePatientExists(linkedPatientId);
      }

      await prisma.symptomReport.create({
        data: {
          patientId: linkedPatientId,
          message,
          location: typeof location === "string" ? location.trim() : null,
          triageLevel: triage.triage,
          triageSummary: triage.summary,
          guidance: triage.guidance,
          nextStep: triage.nextStep,
          specialist,
          doctorsJson: JSON.stringify(doctors),
          aiMode: AI_MODE,
          usedGooglePlace: AI_MODE === "live" && Boolean(GOOGLE_MAPS_API_KEY),
        },
      });

      if (linkedPatientId) {
        updatePatientMedicalMemory({
          patientId: linkedPatientId,
          newUserMessage: message,
          newAssistantMessage: assistantText,
          triageLevel,
        }).catch(() => {});
      }
    } else {
      const linkedPatientId =
        Number.isInteger(Number(patientId)) && Number(patientId) > 0 ? Number(patientId) : null;

      if (!linkedPatientId) {
        return res.status(400).json({ error: "patientId requis pour l'analyse medecin (OTP obligatoire)." });
      }

      const patientExists = await ensurePatientExists(linkedPatientId);
      if (!patientExists) {
        return res.status(404).json({ error: "Patient introuvable." });
      }

      const hasLink = await ensureDoctorHasActiveLink({
        doctorUserId: req.session.id,
        patientId: linkedPatientId,
      });
      if (!hasLink) {
        return res.status(403).json({
          error: "Patient non autorise pour ce medecin. Realisez l'association via OTP.",
        });
      }

      const lastPatientSymptom = await prisma.symptomReport.findFirst({
        where: { patientId: linkedPatientId },
        orderBy: { createdAt: "desc" },
        select: { location: true, triageLevel: true, triageSummary: true, specialist: true },
      });

      const triageResult = detectTriage(message);
      triageLevel = triageResult.triage;
      const triageSummary = triageResult.summary;
      const guidance = triageResult.guidance;
      const nextStep = triageResult.nextStep;
      const specialist = recommendSpecialist(message);

      const clinicalSummary = `Analyse clinique du message: ${message}`;
      const hypotheses =
        triageLevel === "RED"
          ? [
              "Cas potentiellement critique a evaluer immediatement",
              "Verifier constantes vitales et protocoles d'urgence",
            ]
          : triageLevel === "ORANGE"
          ? [
              "Consultation et examen clinique recommandes",
              "Approfondir bilan etiologique",
            ]
          : [
              "Tableau potentiellement benin selon les donnees fournies",
              "Surveillance et reevaluation si aggravation",
            ];

      try {
        const historyMessages = await loadConversationHistoryForLLM(conversationId, { limit: 18 });

        if (streamRequested) {
          if (AI_MODE !== "live") {
            return res
              .status(400)
              .json({ error: "Streaming indisponible en mode mock. Activez AI_MODE=live." });
          }
          if (!LLM_API_KEY) {
            return res.status(400).json({
              error: "Streaming indisponible sans LLM_API_KEY. Configurez backend/.env.",
            });
          }

          res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache, no-transform");
          res.setHeader("Connection", "keep-alive");
          res.flushHeaders?.();

          res.write(`data: ${JSON.stringify({ type: "meta", triageLevel })}\n\n`);

          const systemPrompt =
            "Tu es l'Agent IA Medecin (assistant clinique). Conversation naturelle, concise, actionnable. " +
            "Pas de certitude diagnostique. Mets en avant les red flags et les infos manquantes. " +
            "Termine par 2-4 questions de clarification si necessaire.";

          const clinicalContext = [
            `Niveau de vigilance calcule: ${triageLevel}`,
            `Hypotheses preliminaires (regles): ${hypotheses.join(" | ")}`,
            `Localisation patient (dernier triage): ${lastPatientSymptom?.location || "N/A"}`,
            `Triage patient (dernier): ${lastPatientSymptom?.triageLevel || "N/A"} | resume=${lastPatientSymptom?.triageSummary || "N/A"}`,
            `Specialiste probable (dernier triage patient): ${lastPatientSymptom?.specialist || "N/A"}`,
            `Dernier message: ${message}`,
            "Format prefere (court): Synthese / Hypotheses / A verifier / Message patient (simple).",
          ].join("\n");

          const llmMessages = buildDoctorAgentMessages({
            systemPrompt,
            historyMessages,
            clinicalContext,
          });
          const llmMessagesWithImages = withVisionUserMessage({
            baseMessages: llmMessages,
            userText:
              "Des images ont ete ajoutees au message medecin. Prends-les en compte pour le contexte.",
            imageInputs,
          });

          assistantText = await callLLMStream({
            messages: llmMessagesWithImages,
            temperature: 0.2,
            maxTokens: 650,
            onDelta: (delta) => {
              res.write(`data: ${JSON.stringify({ type: "delta", delta })}\n\n`);
            },
          });

          res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
          res.end();
        } else {
          assistantText = await generateDoctorAssistantText({
            message,
            triage: triageLevel,
            hypotheses,
            historyMessages,
            imageInputs,
            patientLocation: lastPatientSymptom?.location || null,
            patientTriageLevel: lastPatientSymptom?.triageLevel || null,
            patientTriageSummary: lastPatientSymptom?.triageSummary || null,
            patientSpecialist: lastPatientSymptom?.specialist || null,
          });
        }
      } catch (error) {
        aiFallbackUsed = true;
        const reason = String(error?.message || "").includes("429")
          ? "Quota/limite OpenRouter atteinte (HTTP 429)."
          : "Service IA externe indisponible.";
        assistantText = composeDoctorAssistantReply({
          triage: triageLevel,
          clinicalSummary,
          hypotheses,
        });
        assistantText += `\n\n[Info technique] ${reason} Reponse de secours activee.`;

        if (streamRequested && res.headersSent) {
          res.write(`data: ${JSON.stringify({ type: "delta", delta: assistantText })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: "done", aiFallbackUsed: true })}\n\n`);
          res.end();
        }
      }

      // linkedPatientId + active OTP link already validated earlier.

      await prisma.doctorAnalysis.create({
        data: {
          patientId: linkedPatientId,
          doctorUserId: req.session.id,
          patientProfile: linkedPatientId
            ? `Patient #${linkedPatientId}`
            : "Patient non specifie",
          triageLevel: triageLevel,
          symptoms: message,
          medicalData: null,
          clinicalSummary,
          hypothesesJson: JSON.stringify(hypotheses),
          patientFriendlyExplanation:
            "Explication en langage simple a fournir au patient apres validation clinique.",
        },
      });

      if (linkedPatientId) {
        updatePatientMedicalMemory({
          patientId: linkedPatientId,
          newUserMessage: message,
          newAssistantMessage: assistantText,
          triageLevel,
        }).catch(() => {});
      }

      // Create a patient report draft that the doctor must approve before it becomes visible.
      await prisma.patientReport.create({
        data: {
          patientId: linkedPatientId,
          doctorUserId: req.session.id,
          status: "DRAFT",
          triageLevel,
          triageSummary,
          guidance,
          nextStep,
          specialist,
          doctorDraftText: assistantText,
        },
      });
    }

    const assistantMessage = await prisma.chatMessage.create({
      data: {
        conversationId,
        author: "ASSISTANT",
        content: assistantText,
        triageLevel,
      },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        title: conversation.title,
      },
    });

    if (streamRequested) {
      // SSE response already ended; nothing else to send.
      return;
    }

    return res.json({ assistantMessage, triageLevel, aiFallbackUsed });
  } catch (error) {
    return res.status(500).json({ error: "Erreur chat", details: error.message });
  }
});

app.post("/patients", async (req, res) => {
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
});

app.get("/patients/:id/history", authRequired, async (req, res) => {
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

    // Patient must not see the longitudinal medical report (even if they are the owner).
    // They can consult their conversation history normally via chat endpoints.
    if (isOwner && req.session.role === "PATIENT") {
      return res.status(403).json({
        error: "Historique medical longitudinal indisponible cote patient.",
      });
    }

    return res.json(patient);
  } catch (error) {
    return res.status(500).json({ error: "Erreur lecture historique", details: error.message });
  }
});

// Doctor <-> Patient pairing (OTP)
app.post("/doctor/patient-link/request-otp", authLimiter, authRequired, requireRole("DOCTOR"), async (req, res) => {
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

    // Reset pending OTPs for this doctor/patient.
    await prisma.pairingOtp.deleteMany({
      where: {
        doctorUserId: req.session.id,
        patientId,
      },
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

    // Best effort: if SMTP not configured, we still return success.
    try {
      await sendEmail({ to, subject, text });
    } catch (_e) {
      // ignore to keep OTP flow usable in mock/dev
    }

    return res.json({ message: "OTP envoye (best effort).", expiresInMinutes: getOtpTtlMinutes() });
  } catch (error) {
    return res.status(500).json({ error: "Erreur request-otp", details: error.message });
  }
});

app.post("/doctor/patient-link/confirm-otp", authLimiter, authRequired, requireRole("DOCTOR"), async (req, res) => {
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
      await prisma.doctorPatientLink.updateMany({
        where: { doctorUserId: req.session.id, patientId },
        data: { status: "EXPIRED" },
      }).catch(() => {});
      return res.status(403).json({ error: "Nombre de tentatives depasse." });
    }

    const otpHash = sha256(otp);
    const otpMatches = record.otpHash === otpHash;
    if (!otpMatches) {
      await prisma.pairingOtp.update({
        where: { id: record.id },
        data: { attempts: currentAttempts + 1 },
      }).catch(() => {});
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

    // Step 1 (MVP): auto-create an initial DRAFT report for this patient
    // so the doctor can validate without sending any extra message.
    try {
      await ensureDraftReportExistsForDoctorPatient({
        doctorUserId: req.session.id,
        patientId,
      });
    } catch (_e) {
      // best-effort: UI can still work after manual doctor message.
    }

    return res.json({ message: "Association confirme. Rapport autorise.", status: "ACTIVE" });
  } catch (error) {
    return res.status(500).json({ error: "Erreur confirm-otp", details: error.message });
  }
});

app.get("/doctor/patient-link/status", authRequired, requireRole("DOCTOR"), async (req, res) => {
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
      link?.status === "ACTIVE" && link.expiresAt && link.expiresAt <= now ? "EXPIRED" : link?.status || "NONE";
    return res.json({ status });
  } catch (error) {
    return res.status(500).json({ error: "Erreur status-link", details: error.message });
  }
});

// Patient: dernier triage / contexte (pour afficher rendez-vous + medecins)
app.get("/patient/symptom-reports/latest", authRequired, requireRole("PATIENT"), async (req, res) => {
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
});

// Patient: statut association medecin-patient (OTP)
app.get("/patient/doctor-link/status", authRequired, requireRole("PATIENT"), async (req, res) => {
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
});

// Patient: recherche de medecins pres de la localisation (Google si live, sinon mock)
app.get("/patient/doctors/search", authRequired, requireRole("PATIENT"), async (req, res) => {
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
});

// Patient: demarrer une consultation via OTP (association medecin/patient)
app.post("/patient/consultation/request", authLimiter, authRequired, requireRole("PATIENT"), async (req, res) => {
  try {
    const schema = z.object({
      // optionnel: pour forcer un medecin specific
      doctorUserId: z.number().int().positive().optional(),
      // optionnel: aider a stocker la localisation cote SymptomReport (dernier triage)
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

    // Mise a jour best-effort de la localisation du dernier triage
    if (typeof parsed.data.location === "string" && parsed.data.location.trim() && latestSymptom?.id) {
      await prisma.symptomReport
        .updateMany({
          where: { patientId: patient.id, id: latestSymptom.id },
          data: { location: parsed.data.location.trim() },
        })
        .catch(() => {});
    }

    let doctorUserId = parsed.data.doctorUserId;

    // Auto-selection si pas de medecin impose
    if (!doctorUserId) {
      const normalizedSpecialist = normalize(patientSpecialist);
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

    // Si deja associe activement, on retourne directement.
    const alreadyActive = await prisma.doctorPatientLink.findFirst({
      where: { doctorUserId, patientId: patient.id, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
    });
    if (alreadyActive) {
      return res.json({ message: "Association deja activee.", status: "ACTIVE" });
    }

    // Reset OTP + lien pending pour ce doctor/patient
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
      // best effort: SMTP non configure -> on garde quand meme la demande activee
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
});

// Doctor: liste des demandes en attente (OTP envoye ou association pending)
app.get("/doctor/patient-link/pending", authRequired, requireRole("DOCTOR"), async (req, res) => {
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
});

// --- OTP medecin-patient via email patient ---
app.post(
  "/doctor/patient-link/request-otp-by-email",
  authLimiter,
  authRequired,
  requireRole("DOCTOR"),
  async (req, res) => {
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

      // Reset pending OTPs for this doctor/patient.
      await prisma.pairingOtp.deleteMany({
        where: {
          doctorUserId: req.session.id,
          patientId,
        },
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
        // best effort (SMTP non configure)
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
);

app.post(
  "/doctor/patient-link/confirm-otp-by-email",
  authLimiter,
  authRequired,
  requireRole("DOCTOR"),
  async (req, res) => {
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
        await prisma.doctorPatientLink.updateMany({
          where: { doctorUserId: req.session.id, patientId },
          data: { status: "EXPIRED" },
        }).catch(() => {});
        return res.status(403).json({ error: "Nombre de tentatives depasse." });
      }

      const otpHash = sha256(otp);
      const otpMatches = record.otpHash === otpHash;
      if (!otpMatches) {
        await prisma.pairingOtp.update({
          where: { id: record.id },
          data: { attempts: currentAttempts + 1 },
        }).catch(() => {});
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

      // Step 1 (MVP): auto-create an initial DRAFT report for this patient.
      try {
        await ensureDraftReportExistsForDoctorPatient({
          doctorUserId: req.session.id,
          patientId,
        });
      } catch (_e) {
        // best-effort
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
);

app.get(
  "/doctor/patient-link/status-by-email",
  authRequired,
  requireRole("DOCTOR"),
  async (req, res) => {
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
        link?.status === "ACTIVE" && link.expiresAt && link.expiresAt <= now ? "EXPIRED" : link?.status || "NONE";
      return res.json({ status, patientId });
    } catch (error) {
      return res.status(500).json({ error: "Erreur status-by-email", details: error.message });
    }
  }
);

// Patient can fetch latest approved report (post validation)
app.get("/patient/reports/latest", authRequired, requireRole("PATIENT"), async (req, res) => {
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
});

// Doctor can fetch latest draft report for a given patient (for approval UI)
app.get("/doctor/reports/latest", authRequired, requireRole("DOCTOR"), async (req, res) => {
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
});

app.post("/doctor/reports/:reportId/approve", authLimiter, authRequired, requireRole("DOCTOR"), async (req, res) => {
  try {
    const reportId = Number(req.params.reportId);
    if (!Number.isInteger(reportId) || reportId <= 0) {
      return res.status(400).json({ error: "reportId invalide." });
    }

    const schema = z.object({
      // Optional: allow editing doctor draft text before generating patient final report.
      editedDoctorDraftText: z.string().trim().optional(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Donnees invalides.", details: parsed.error.flatten() });
    }

    const draft = await prisma.patientReport.findUnique({
      where: { id: reportId },
    });
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
    }).catch((e) => {
      // Fallback: keep concise message if LLM fails.
      return `Votre medecin a valide un rapport. Niveau de vigilance: ${draft.triageLevel || "N/A"}. ${draft.nextStep ? `Prochaines etapes: ${draft.nextStep}` : ""}`;
    });

    const approvedAt = new Date();
    let status = "APPROVED";
    let sentAt = null;

    // Best effort email sending.
    try {
      await sendEmail({
        to: patient.user.email,
        subject: "Votre rapport patient - Medical AI",
        text: `Bonjour ${patient.user.fullName || patient.fullName},\n\nVoici le rapport validé par votre médecin.\n\n${patientFinalText}\n`,
      });
      status = "SENT";
      sentAt = new Date();
    } catch (_e) {
      // ignore: allow app to work even without SMTP
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
});

app.use((_req, res) => {
  res.status(404).json({ error: "Route non trouvee" });
});

async function ensureSuperAdminSeed() {
  const existing = await prisma.user.findUnique({ where: { email: SUPERADMIN_EMAIL } });

  if (existing) {
    if (existing.role !== "SUPERADMIN" || existing.status !== "ACTIVE") {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          role: "SUPERADMIN",
          status: "ACTIVE",
          fullName: SUPERADMIN_NAME,
          emailVerified: true,
        },
      });
    }
    return;
  }

  await prisma.user.create({
    data: {
      email: SUPERADMIN_EMAIL,
      fullName: SUPERADMIN_NAME,
      role: "SUPERADMIN",
      status: "ACTIVE",
      emailVerified: true,
      passwordHash: hashPassword(SUPERADMIN_PASSWORD),
    },
  });
}

async function startServer() {
  try {
    await prisma.$connect();
    await ensureSuperAdminSeed();

    app.listen(PORT, () => {
      console.log(`Medical AI backend running on http://localhost:${PORT}`);
      console.log(`Superadmin login: ${SUPERADMIN_EMAIL} / ${SUPERADMIN_PASSWORD}`);
    });
  } catch (error) {
    console.error("Unable to start server:", error.message);
    process.exit(1);
  }
}

startServer();

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
