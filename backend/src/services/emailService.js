const nodemailer = require("nodemailer");
const { prisma } = require("../db/prisma");
const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  APP_BASE_URL,
  EMAIL_TOKEN_TTL_MINUTES,
} = require("../config/env");
const { sha256, createRawToken } = require("../utils/crypto");

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

/**
 * [Module: src/services/emailService.js] tokenExpiryDate
 * Returns the expiration date for email verification/reset tokens.
 */
function tokenExpiryDate() {
  return new Date(Date.now() + EMAIL_TOKEN_TTL_MINUTES * 60 * 1000);
}

/**
 * [Module: src/services/emailService.js] sendEmail
 * Sends an email via configured SMTP transport.
 */
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

/**
 * [Module: src/services/emailService.js] ensureEmailServiceConfigured
 * Throws when SMTP config is missing (used by auth endpoints).
 */
function ensureEmailServiceConfigured() {
  if (!mailTransporter) {
    throw new Error(
      "SMTP non configure. Definissez SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM."
    );
  }
}

/**
 * [Module: src/services/emailService.js] issueEmailVerificationToken
 * Creates a new email verification token and returns the raw token.
 */
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

/**
 * [Module: src/services/emailService.js] issuePasswordResetToken
 * Creates a new password reset token and returns the raw token.
 */
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

/**
 * [Module: src/services/emailService.js] sendVerificationEmail
 * Sends a verification link to the user's email.
 */
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

/**
 * [Module: src/services/emailService.js] sendPasswordResetEmail
 * Sends a password reset link to the user's email.
 */
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

module.exports = {
  sendEmail,
  ensureEmailServiceConfigured,
  issueEmailVerificationToken,
  issuePasswordResetToken,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
