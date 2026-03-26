const { prisma } = require("../../db/prisma");
const {
  AI_MODE,
  GOOGLE_MAPS_API_KEY,
  LLM_API_KEY,
  LLM_MODEL,
  LLM_VISION_MODEL,
} = require("../../config/env");
const { detectTriage, recommendSpecialist } = require("../../utils/triage");
const { normalizeAssistantPersona, assistantPersonaToStyle } = require("../../utils/persona");
const { shouldUseVision, withVisionUserMessage } = require("../../utils/images");
const { searchDoctorsFromGoogle } = require("../../services/doctorSearchService");
const {
  composePatientAssistantReply,
  composeDoctorAssistantReply,
} = require("../../services/assistantFallbackService");
const {
  callLLMStream,
  buildPatientAgentMessages,
  buildDoctorAgentMessages,
  generatePatientAssistantText,
  generateDoctorAssistantText,
} = require("../../services/llmService");
const {
  loadConversationHistoryForLLM,
  updatePatientMedicalMemory,
} = require("../../services/conversationService");
const {
  ensurePatientExists,
  ensureDoctorHasActiveLink,
} = require("../../services/patientService");

/**
 * [Module: src/routes/chat/messageHandlers.js] extractPatientContext
 * Builds a small patient context object from the conversation user profile.
 */
function extractPatientContext(conversation) {
  const profile = conversation?.user?.patientProfile || null;
  if (!profile) return null;
  return {
    age: profile.age,
    sex: profile.sex,
    city: profile.city,
    medicalMemory: profile.medicalMemory,
    assistantPersona: profile.assistantPersona,
  };
}

/**
 * [Module: src/routes/chat/messageHandlers.js] renderPatientContext
 * Returns a safe text block for streaming prompts.
 */
function renderPatientContext(patientContext) {
  if (!patientContext || typeof patientContext !== "object") {
    return "Contexte patient: non disponible.";
  }

  return [
    `Contexte patient (si connu): age=${patientContext.age ?? "N/A"}, sexe=${
      patientContext.sex ?? "N/A"
    }, ville=${patientContext.city ?? "N/A"}`,
    patientContext.medicalMemory
      ? `Memoire medicale persistante:\n${patientContext.medicalMemory}`
      : "Memoire medicale persistante: (vide)",
    `Persona assistant patient: ${normalizeAssistantPersona(
      patientContext.assistantPersona || "DOCTOR"
    )}`,
  ].join("\n");
}

/**
 * [Module: src/routes/chat/messageHandlers.js] resolveDoctors
 * Looks up nearby doctors (Google Places when live, fallback otherwise).
 */
async function resolveDoctors({ location, specialist }) {
  if (!location) return [];

  if (AI_MODE === "live" && GOOGLE_MAPS_API_KEY) {
    try {
      return await searchDoctorsFromGoogle({ specialist, near: location });
    } catch (_error) {
      return [];
    }
  }

  return [];
}

/**
 * [Module: src/routes/chat/messageHandlers.js] handlePatientMessage
 * Runs the patient flow (triage, LLM response, symptom report).
 */
async function handlePatientMessage({
  req,
  res,
  conversationId,
  conversation,
  message,
  location,
  imageInputs,
  streamRequested,
  patientId,
}) {
  const triage = detectTriage(message);
  const specialist = recommendSpecialist(message);
  const doctors = await resolveDoctors({ location, specialist });

  let assistantText = "";
  let aiFallbackUsed = false;
  let patientContext = null;

  try {
    const historyMessages = await loadConversationHistoryForLLM(conversationId, { limit: 18 });
    patientContext = extractPatientContext(conversation);

    if (streamRequested) {
      if (AI_MODE !== "live") {
        res.status(400).json({
          error: "Streaming indisponible en mode mock. Activez AI_MODE=live.",
        });
        return { stop: true };
      }
      if (!LLM_API_KEY) {
        res.status(400).json({
          error: "Streaming indisponible sans LLM_API_KEY. Configurez backend/.env.",
        });
        return { stop: true };
      }

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      res.write(`data: ${JSON.stringify({ type: "meta", triageLevel: triage.triage })}\n\n`);

      const doctorsText =
        doctors.length === 0
          ? "Aucun praticien local trouve actuellement."
          : doctors
              .map(
                (d, index) =>
                  `${index + 1}. ${d.name} - ${d.address}${d.rating ? ` (note ${d.rating})` : ""}`
              )
              .join("\n");

      const systemPrompt =
        "Tu es l'Agent IA Patient d'une plateforme medicale. Objectif: conversation naturelle, empathique et utile, tout en restant prudent. " +
        "Tu ne poses pas de diagnostic. Tu expliques en mots simples. Tu poses 1 a 3 questions courtes si des infos manquent. " +
        "Si le triage est RED, tu recommandes explicitement d'aller aux urgences immediatement. " +
        "Si le triage est ORANGE ou RED, tu proposes explicitement la fonctionnalite 'Rendez-vous' dans l'app (ajouter localisation puis demande de consultation).";

      const triageContext = [
        renderPatientContext(patientContext),
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
      const useVision = shouldUseVision(imageInputs);
      const llmMessagesWithImages = useVision
        ? withVisionUserMessage({
            baseMessages: llmMessages,
            userText:
              "Le patient a ajoute des images a ce message. Prends-les en compte avec prudence.",
            imageInputs,
          })
        : llmMessages;

      assistantText = await callLLMStream({
        messages: llmMessagesWithImages,
        temperature: 0.25,
        maxTokens: 520,
        model: useVision ? LLM_VISION_MODEL : LLM_MODEL,
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
      : conversation.user?.patientProfile?.id || null;

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
      triageLevel: triage.triage,
    }).catch(() => {});
  }

  return {
    assistantText,
    triageLevel: triage.triage,
    aiFallbackUsed,
  };
}

/**
 * [Module: src/routes/chat/messageHandlers.js] handleDoctorMessage
 * Runs the doctor flow (triage, LLM response, draft report).
 */
async function handleDoctorMessage({
  req,
  res,
  conversationId,
  message,
  imageInputs,
  streamRequested,
  patientId,
}) {
  const linkedPatientId =
    Number.isInteger(Number(patientId)) && Number(patientId) > 0 ? Number(patientId) : null;

  if (!linkedPatientId) {
    res.status(400).json({ error: "patientId requis pour l'analyse medecin (OTP obligatoire)." });
    return { stop: true };
  }

  const patientExists = await ensurePatientExists(linkedPatientId);
  if (!patientExists) {
    res.status(404).json({ error: "Patient introuvable." });
    return { stop: true };
  }

  const hasLink = await ensureDoctorHasActiveLink({
    doctorUserId: req.session.id,
    patientId: linkedPatientId,
  });
  if (!hasLink) {
    res.status(403).json({
      error: "Patient non autorise pour ce medecin. Realisez l'association via OTP.",
    });
    return { stop: true };
  }

  const lastPatientSymptom = await prisma.symptomReport.findFirst({
    where: { patientId: linkedPatientId },
    orderBy: { createdAt: "desc" },
    select: { location: true, triageLevel: true, triageSummary: true, specialist: true },
  });

  const triageResult = detectTriage(message);
  const triageLevel = triageResult.triage;
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
      ? ["Consultation et examen clinique recommandes", "Approfondir bilan etiologique"]
      : [
          "Tableau potentiellement benin selon les donnees fournies",
          "Surveillance et reevaluation si aggravation",
        ];

  let assistantText = "";
  let aiFallbackUsed = false;

  try {
    const historyMessages = await loadConversationHistoryForLLM(conversationId, { limit: 18 });

    if (streamRequested) {
      if (AI_MODE !== "live") {
        res.status(400).json({
          error: "Streaming indisponible en mode mock. Activez AI_MODE=live.",
        });
        return { stop: true };
      }
      if (!LLM_API_KEY) {
        res.status(400).json({
          error: "Streaming indisponible sans LLM_API_KEY. Configurez backend/.env.",
        });
        return { stop: true };
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
        `Triage patient (dernier): ${lastPatientSymptom?.triageLevel || "N/A"} | resume=${
          lastPatientSymptom?.triageSummary || "N/A"
        }`,
        `Specialiste probable (dernier triage patient): ${
          lastPatientSymptom?.specialist || "N/A"
        }`,
        `Dernier message: ${message}`,
        "Format prefere (court): Synthese / Hypotheses / A verifier / Message patient (simple).",
      ].join("\n");

      const llmMessages = buildDoctorAgentMessages({
        systemPrompt,
        historyMessages,
        clinicalContext,
      });
      const useVision = shouldUseVision(imageInputs);
      const llmMessagesWithImages = useVision
        ? withVisionUserMessage({
            baseMessages: llmMessages,
            userText:
              "Des images ont ete ajoutees au message medecin. Prends-les en compte pour le contexte.",
            imageInputs,
          })
        : llmMessages;

      assistantText = await callLLMStream({
        messages: llmMessagesWithImages,
        temperature: 0.2,
        maxTokens: 650,
        model: useVision ? LLM_VISION_MODEL : LLM_MODEL,
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

  await prisma.doctorAnalysis.create({
    data: {
      patientId: linkedPatientId,
      doctorUserId: req.session.id,
      patientProfile: linkedPatientId ? `Patient #${linkedPatientId}` : "Patient non specifie",
      triageLevel,
      symptoms: message,
      medicalData: null,
      clinicalSummary,
      hypothesesJson: JSON.stringify(hypotheses),
      patientFriendlyExplanation:
        "Explication en langage simple a fournir au patient apres validation clinique.",
    },
  });

  updatePatientMedicalMemory({
    patientId: linkedPatientId,
    newUserMessage: message,
    newAssistantMessage: assistantText,
    triageLevel,
  }).catch(() => {});

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

  return { assistantText, triageLevel, aiFallbackUsed };
}

module.exports = { handlePatientMessage, handleDoctorMessage };
