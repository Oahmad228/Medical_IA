const { prisma } = require("../../db/prisma");
const { ensureDoctorHasActiveLink } = require("../../services/patientService");

/**
 * [Module: src/routes/chat/conversations.js] listConversations
 * Returns conversation list for the authenticated user.
 */
async function listConversations(req, res) {
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
}

/**
 * [Module: src/routes/chat/conversations.js] createConversation
 * Creates a new conversation and optionally locks it to a patient (doctor).
 */
async function createConversation(req, res) {
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
}

/**
 * [Module: src/routes/chat/conversations.js] getConversationMessages
 * Returns message history for a conversation (with access checks).
 */
async function getConversationMessages(req, res) {
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
      // Allow general (non-patient) doctor conversations.
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
}

/**
 * [Module: src/routes/chat/conversations.js] deleteConversation
 * Deletes a conversation and its messages.
 */
async function deleteConversation(req, res) {
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
}

module.exports = {
  listConversations,
  createConversation,
  getConversationMessages,
  deleteConversation,
};
