const { prisma } = require("../../db/prisma");
const { hashPassword, sha256 } = require("../../utils/crypto");
const {
  ensureEmailServiceConfigured,
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require("../../services/emailService");

/**
 * [Module: src/routes/auth/emailHandlers.js]
 * Gere les emails de verification et de reinitialisation.
 */

/**
 * Envoie un email de verification si le compte existe.
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
 * Valide un token de verification email.
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
 * Envoie un email de reinitialisation si le compte existe.
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
 * Reinitialise le mot de passe via un token valide.
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

module.exports = { requestVerification, confirmVerification, forgotPassword, resetPassword };
