const { prisma } = require("../db/prisma");
const { LLM_API_KEY } = require("../config/env");
const { callLLM, mapStoredAuthorToLLMRole, generateDoctorAssistantText } = require("./llmService");

/**
 * [Module: src/services/conversationService.js] loadConversationHistoryForLLM
 * Loads recent messages with optional stored summary for LLM context.
 */
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

/**
 * [Module: src/services/conversationService.js] maybeRefreshConversationSummary
 * Updates the conversation summary when the thread grows beyond a threshold.
 */
async function maybeRefreshConversationSummary(conversationId) {
  const id = Number(conversationId);
  const conv = await prisma.conversation.findUnique({
    where: { id },
    select: { id: true, summaryMessageCount: true },
  });
  if (!conv) return;

  const total = await prisma.chatMessage.count({ where: { conversationId: id } });

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

/**
 * [Module: src/services/conversationService.js] updatePatientMedicalMemory
 * Keeps a compact clinical memory per patient (LLM only).
 */
async function updatePatientMedicalMemory({ patientId, newUserMessage, newAssistantMessage, triageLevel }) {
  const id = Number(patientId);
  if (!Number.isInteger(id) || id <= 0) return;

  const patient = await prisma.patient.findUnique({
    where: { id },
    select: { id: true, medicalMemory: true, fullName: true, age: true, sex: true, city: true },
  });
  if (!patient) return;

  if (!LLM_API_KEY) return;

  const summarizerMessages = [
    {
      role: "system",
      content:
        "Tu es la memoire clinique persistante d'un agent medical. Tu maintiens un 'rapport medical' compact et utile sur un patient. " +
        "Objectif: aider les futures conversations. " +
        "Contraintes: pas de diagnostic certain, pas de speculation inutile. " +
        "N'inclus que des informations medicales (symptomes, traitements, antecedents, examens, signaux d'alerte). " +
        "Ignore les details personnels non medicaux sauf si explicitement presents comme pertinents pour la sante. " +
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
        "Rappel: ne conserve que ce qui est medicalement pertinent.",
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

/**
 * [Module: src/services/conversationService.js] ensureDraftReportExistsForDoctorPatient
 * Creates a draft report on OTP confirmation if none exists yet.
 */
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
    return null;
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

module.exports = {
  loadConversationHistoryForLLM,
  maybeRefreshConversationSummary,
  updatePatientMedicalMemory,
  ensureDraftReportExistsForDoctorPatient,
};
