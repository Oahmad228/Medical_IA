const { z } = require("zod");
const { prisma } = require("../../db/prisma");
const { sendEmail } = require("../../services/emailService");
const { ensureDoctorHasActiveLink } = require("../../services/patientService");
const { generatePatientReportFromDoctor, evaluateReportEmotionLevel } = require("../../services/llmService");

/**
 * [Module: src/routes/doctor/reportHandlers.js]
 * Gere la validation et l'envoi des rapports patient.
 */

/**
 * Retourne le dernier rapport draft pour un patient.
 */
async function getLatestDraftReport(req, res) {
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
}

/**
 * Approuve un rapport draft et genere la version patient.
 */
async function approveReport(req, res) {
  try {
    const reportId = Number(req.params.reportId);
    if (!Number.isInteger(reportId) || reportId <= 0) {
      return res.status(400).json({ error: "reportId invalide." });
    }

    const schema = z.object({
      editedDoctorDraftText: z.string().trim().optional(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Donnees invalides.", details: parsed.error.flatten() });
    }

    const draft = await prisma.patientReport.findUnique({ where: { id: reportId } });
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

    let patientFinalText = "";
    try {
      patientFinalText = await generatePatientReportFromDoctor({
        patient,
        doctorDraftText,
        triageLevel: draft.triageLevel,
        triageSummary: draft.triageSummary,
        guidance: draft.guidance,
        nextStep: draft.nextStep,
        specialist: draft.specialist,
      });
    } catch (_e) {
      return res.status(502).json({ error: "Generation rapport IA indisponible." });
    }

    let emotionLevel = null;
    try {
      emotionLevel = await evaluateReportEmotionLevel({
        patientFinalText,
        triageLevel: draft.triageLevel,
      });
    } catch (_e) {
      return res.status(502).json({ error: "Evaluation emotion IA indisponible." });
    }

    const approvedAt = new Date();
    let status = "APPROVED";
    let sentAt = null;

    try {
      await sendEmail({
        to: patient.user.email,
        subject: "Votre rapport patient - Medical AI",
        text: `Bonjour ${patient.user.fullName || patient.fullName},\n\nVoici le rapport valide par votre medecin.\n\n${patientFinalText}\n`,
      });
      status = "SENT";
      sentAt = new Date();
    } catch (_e) {
      // best effort
    }

    await prisma.patientReport.update({
      where: { id: reportId },
      data: {
        doctorDraftText,
        patientFinalText,
        emotionLevel,
        approvedAt,
        sentAt,
        status,
      },
    });

    return res.json({ message: "Rapport approuve.", status });
  } catch (error) {
    return res.status(500).json({ error: "Erreur approve-report", details: error.message });
  }
}

module.exports = { getLatestDraftReport, approveReport };
