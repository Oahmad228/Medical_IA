const {
  LLM_API_KEY,
  LLM_PROVIDER,
  LLM_BASE_URL,
  LLM_MODEL,
  LLM_VISION_MODEL,
  LLM_APP_NAME,
  LLM_APP_SITE,
} = require("../config/env");
const { isGreetingOnly } = require("../utils/normalize");
const { normalizeAssistantPersona, assistantPersonaToStyle } = require("../utils/persona");
const { shouldUseVision, withVisionUserMessage } = require("../utils/images");

/**
 * [Module: src/services/llmService.js] extractAssistantText
 * Extracts assistant text from an OpenAI-compatible response payload.
 */
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

/**
 * [Module: src/services/llmService.js] mapStoredAuthorToLLMRole
 * Maps stored chat authors to LLM roles.
 */
function mapStoredAuthorToLLMRole(author) {
  if (author === "ASSISTANT") return "assistant";
  if (author === "SYSTEM") return "system";
  return "user";
}

/**
 * [Module: src/services/llmService.js] callLLM
 * Calls the LLM with a non-streaming request and returns the assistant text.
 */
async function callLLM({
  systemPrompt,
  userPrompt,
  messages,
  temperature = 0.3,
  maxTokens = 500,
  model = LLM_MODEL,
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
      model,
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

/**
 * [Module: src/services/llmService.js] callLLMStream
 * Calls the LLM with SSE streaming and invokes onDelta for each chunk.
 */
async function callLLMStream({
  messages,
  temperature = 0.3,
  maxTokens = 500,
  onDelta,
  model = LLM_MODEL,
}) {
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
      model,
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

/**
 * [Module: src/services/llmService.js] buildPatientAgentMessages
 * Builds base LLM messages for the patient assistant.
 */
function buildPatientAgentMessages({ systemPrompt, historyMessages, triageContext }) {
  return [
    { role: "system", content: systemPrompt },
    ...(Array.isArray(historyMessages) ? historyMessages : []),
    { role: "system", content: triageContext },
  ];
}

/**
 * [Module: src/services/llmService.js] buildDoctorAgentMessages
 * Builds base LLM messages for the doctor assistant.
 */
function buildDoctorAgentMessages({ systemPrompt, historyMessages, clinicalContext }) {
  return [
    { role: "system", content: systemPrompt },
    ...(Array.isArray(historyMessages) ? historyMessages : []),
    { role: "system", content: clinicalContext },
  ];
}

/**
 * [Module: src/services/llmService.js] generatePatientAssistantText
 * Generates patient assistant text using triage context and optional images.
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
 * [Module: src/services/llmService.js] generateDoctorAssistantText
 * Generates doctor assistant text using clinical context and optional images.
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
 * [Module: src/services/llmService.js] generatePatientReportFromDoctor
 * Converts a doctor draft into a patient-friendly report text.
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

module.exports = {
  extractAssistantText,
  mapStoredAuthorToLLMRole,
  callLLM,
  callLLMStream,
  buildPatientAgentMessages,
  buildDoctorAgentMessages,
  generatePatientAssistantText,
  generateDoctorAssistantText,
  generatePatientReportFromDoctor,
};
