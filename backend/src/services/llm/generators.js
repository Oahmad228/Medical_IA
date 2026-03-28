const { LLM_MODEL, LLM_VISION_MODEL } = require("../../config/env");
const { isGreetingOnly } = require("../../utils/normalize");
const { normalizeAssistantPersona, assistantPersonaToStyle } = require("../../utils/persona");
const { shouldUseVision, withVisionUserMessage } = require("../../utils/images");
const { callLLM } = require("./client");
const { buildPatientAgentMessages, buildDoctorAgentMessages } = require("./messages");
const { parseEmotionLevel } = require("./utils");

/**
 * [Module: src/services/llm/generators.js]
 * Generation de reponses et de rapports via LLM.
 */

/**
 * Genere la reponse de l'assistant patient.
 */
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
  const useVision = shouldUseVision(imageInputs);
  const messages = useVision
    ? withVisionUserMessage({
        baseMessages,
        userText:
          "Le patient vient d'envoyer des images. Analyse-les avec prudence, sans diagnostic certain, puis reponds.",
        imageInputs,
      })
    : baseMessages;
  const model = useVision ? LLM_VISION_MODEL : LLM_MODEL;
  return callLLM({ messages, temperature: 0.25, maxTokens: 520, model });
}

/**
 * Genere la reponse de l'assistant medecin.
 */
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
  patientProfile,
  patientMedicalMemory,
  lastReportMeta,
  lastReportText,
}) {
  const systemPrompt =
    "Tu es l'Agent IA Medecin (assistant clinique). Tu parles comme un collegue senior: ton professionnel, direct et clair. " +
    "Pas de certitude diagnostique, mais assume un cadre clinique plausible et propose un plan concret. " +
    "Mets en avant les red flags, les points a verifier et les prochaines actions sans tourner autour du pot. " +
    "Si on te demande un rapport/historique/dossier, reponds avec les elements disponibles du contexte. " +
    "Style: paragraphes naturels, pas de Markdown, pas de titres ni de listes. " +
    "Ne dis pas 'je n'ai pas d'informations'; si une info manque, formule-la comme une question courte a clarifier. " +
    "Termine par 2-4 questions courtes si des infos manquent.";

  const profileLine = patientProfile
    ? `Patient: ${patientProfile.fullName || "N/A"} | age=${patientProfile.age ?? "N/A"} | sexe=${patientProfile.sex || "N/A"} | ville=${patientProfile.city || "N/A"}`
    : "Patient: non lie";

  const medicalMemoryText = patientMedicalMemory
    ? `Memoire clinique: ${String(patientMedicalMemory).slice(0, 1200)}`
    : "Memoire clinique: (vide)";

  const reportMetaText = lastReportMeta ? `Dernier rapport: ${lastReportMeta}` : "Dernier rapport: (aucun)";
  const reportText = lastReportText ? `Rapport recent:
${String(lastReportText).slice(0, 1200)}` : "";

  const clinicalContext = [
    profileLine,
    medicalMemoryText,
    reportMetaText,
    reportText,
    `Niveau de vigilance calcule: ${triage}`,
    `Hypotheses preliminaires (regles): ${hypotheses.join(" | ")}`,
    `Localisation patient (dernier triage): ${patientLocation || "N/A"}`,
    `Triage patient (dernier): ${patientTriageLevel || "N/A"} | resume=${patientTriageSummary || "N/A"}`,
    `Specialiste probable (dernier triage patient): ${patientSpecialist || "N/A"}`,
    `Dernier message: ${message}`,
  ].filter(Boolean).join("\n");

  const baseMessages = buildDoctorAgentMessages({ systemPrompt, historyMessages, clinicalContext });
  const useVision = shouldUseVision(imageInputs);
  const messages = useVision
    ? withVisionUserMessage({
        baseMessages,
        userText:
          "Des images cliniques ont ete jointes au message. Prends-les en compte avec prudence.",
        imageInputs,
      })
    : baseMessages;
  const model = useVision ? LLM_VISION_MODEL : LLM_MODEL;
  return callLLM({ messages, temperature: 0.2, maxTokens: 650, model });
}

/**
 * Transforme un rapport medecin en version patient.
 */
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

  return callLLM({ systemPrompt, userPrompt, temperature: 0.25, maxTokens: 520 });
}

/**
 * Evalue le niveau d'emotion d'un cas (GREEN/ORANGE/RED).
 */
async function evaluateCaseEmotionLevel({ message, triageLevel, triageSummary, guidance, nextStep }) {
  const systemPrompt =
    "Tu es un module de classification du stress clinique. Tu lis un message patient et un resume de triage. " +
    "Tu renvoies un seul mot: GREEN, ORANGE, ou RED. Aucun commentaire.";

  const userPrompt = [
    `Message patient:\n${String(message || "").trim()}`,
    `Triage deterministe: ${triageLevel || "N/A"}`,
    `Synthese triage: ${triageSummary || "N/A"}`,
    `Conseil securite: ${guidance || "N/A"}`,
    `Prochaine etape: ${nextStep || "N/A"}`,
    "Instruction: renvoie uniquement GREEN, ORANGE, ou RED.",
  ].join("\n\n");

  const result = await callLLM({ systemPrompt, userPrompt, temperature: 0, maxTokens: 6 });
  const parsed = parseEmotionLevel(result);
  if (!parsed) {
    throw new Error("Emotion level invalide");
  }
  return parsed;
}

/**
 * Evalue le niveau d'emotion d'un rapport patient.
 */
async function evaluateReportEmotionLevel({ patientFinalText, triageLevel }) {
  const systemPrompt =
    "Tu es un module de classification. Tu lis un rapport medical patient et tu renvoies un seul mot: GREEN, ORANGE, ou RED. " +
    "Aucune phrase. Aucun commentaire.";

  const userPrompt = [
    `Rapport patient:\n${String(patientFinalText || "").trim()}`,
    `Triage initial (si connu): ${triageLevel || "N/A"}`,
    "Instruction: renvoie uniquement GREEN, ORANGE, ou RED.",
  ].join("\n\n");

  const result = await callLLM({ systemPrompt, userPrompt, temperature: 0, maxTokens: 6 });
  const parsed = parseEmotionLevel(result);
  if (!parsed) {
    throw new Error("Emotion level invalide");
  }
  return parsed;
}

module.exports = {
  generatePatientAssistantText,
  generateDoctorAssistantText,
  generatePatientReportFromDoctor,
  evaluateCaseEmotionLevel,
  evaluateReportEmotionLevel,
};
