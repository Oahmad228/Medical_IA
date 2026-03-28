const { z } = require("zod");
const { prisma } = require("../../db/prisma");
const { normalizeIncomingImageInputs, shouldUseVision } = require("../../utils/images");
const { deriveConversationTitleFromMessage, isDefaultConversationTitle } = require("../../utils/titles");
const { maybeRefreshConversationSummary } = require("../../services/conversationService");
const { handlePatientMessage, handleDoctorMessage } = require("./messageHandlers");

/**
 * [Module: src/routes/chat/messages.js] parseMessagePayload
 * Validates and normalizes the message payload.
 */
function parseMessagePayload(body) {
  const schema = z.object({
    message: z.string().trim().min(1).max(6000),
    location: z.string().trim().max(200).optional(),
    patientId: z.union([z.number().int().positive(), z.string().trim()]).optional(),
    images: z.array(z.string().trim().min(1)).max(3).optional(),
  });

  return schema.safeParse(body || {});
}

/**
 * [Module: src/routes/chat/messages.js] applyDoctorConversationLock
 * Ensures doctor conversations are locked to a patient when needed.
 */
async function applyDoctorConversationLock({
  req,
  res,
  conversationId,
  conversation,
  patientId,
}) {
  if (req.session.role !== "DOCTOR") return true;

  const now = new Date();
  const linkedPatientId = patientId;

  if (conversation.lockedUntil && conversation.lockedUntil <= now) {
    res.status(403).json({ error: "Acces refuse. Consultation expiree." });
    return false;
  }

  if (conversation.patientId) {
    if (!linkedPatientId || linkedPatientId !== conversation.patientId) {
      res.status(403).json({
        error: "Conversation verrouillee pour un autre patient. Creer une nouvelle conversation.",
      });
      return false;
    }
    return true;
  }

  if (!linkedPatientId) {
    // General doctor conversation (no patient link).
    return true;
  }

  const existingCount = await prisma.chatMessage.count({ where: { conversationId } });
  if (existingCount > 0) {
    res.status(403).json({
      error: "Conversation non verrouillee et deja utilisee. Creer une nouvelle conversation pour ce patient.",
    });
    return false;
  }

  const link = await prisma.doctorPatientLink.findFirst({
    where: {
      doctorUserId: req.session.id,
      patientId: linkedPatientId,
      status: "ACTIVE",
      expiresAt: { gt: now },
    },
    select: { expiresAt: true },
  });

  if (!link) {
    res.status(403).json({
      error: "Patient non autorise pour ce medecin. Realisez l'association via OTP.",
    });
    return false;
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      patientId: linkedPatientId,
      lockedUntil: link.expiresAt || null,
    },
  });

  return true;
}

/**
 * [Module: src/routes/chat/messages.js] maybeUpdateConversationTitle
 * Updates the conversation title when the first user message arrives.
 */
async function maybeUpdateConversationTitle({ conversationId, conversation, message }) {
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
}

/**
 * [Module: src/routes/chat/messages.js] postMessage
 * Stores a user message, handles triage, and generates assistant response.
 */
async function postMessage(req, res) {
  try {
    const conversationId = Number(req.params.id);
    const streamRequested = String(req.query.stream || "") === "1";

    const parsed = parseMessagePayload(req.body);
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
    const imagesJson = imageInputs.length > 0 ? JSON.stringify(imageInputs) : null;
    const imagesProvided = imageInputs.length > 0;
    const visionUsed = shouldUseVision(imageInputs);
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

    const lockOk = await applyDoctorConversationLock({
      req,
      res,
      conversationId,
      conversation,
      patientId,
    });
    if (!lockOk) return;

    await prisma.chatMessage.create({
      data: {
        conversationId,
        author: "USER",
        content: message,
        imagesJson,
      },
    });

    await maybeUpdateConversationTitle({ conversationId, conversation, message });

    maybeRefreshConversationSummary(conversationId).catch(() => {});

    const handlerResult =
      req.session.role !== "DOCTOR"
        ? await handlePatientMessage({
            req,
            res,
            conversationId,
            conversation,
            message,
            location,
            imageInputs,
            streamRequested,
            patientId,
          })
        : await handleDoctorMessage({
            req,
            res,
            conversationId,
            message,
            imageInputs,
            streamRequested,
            patientId,
          });

    if (handlerResult?.stop) return;

    const assistantMessage = await prisma.chatMessage.create({
      data: {
        conversationId,
        author: "ASSISTANT",
        content: handlerResult.assistantText,
        triageLevel: handlerResult.triageLevel || null,
      },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        title: conversation.title,
      },
    });

    if (streamRequested) {
      return;
    }

    return res.json({
      assistantMessage,
      triageLevel: handlerResult.triageLevel || null,
      emotionLevel: handlerResult.emotionLevel || null,
      imagesProvided,
      visionUsed,
    });
  } catch (error) {
    return res.status(500).json({ error: "Erreur chat", details: error.message });
  }
}

module.exports = { postMessage };
