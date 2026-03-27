const dotenv = require("dotenv");

/**
 * [Module: src/config/env.js] loadEnv
 * Loads environment variables from .env into process.env (used by all backend modules).
 */
function loadEnv() {
  dotenv.config({ override: true });
}

loadEnv();

const PORT = Number(process.env.PORT || 3001);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const LLM_PROVIDER = (process.env.LLM_PROVIDER || "openrouter").toLowerCase();
const LLM_API_KEY = process.env.LLM_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL || "meta-llama/llama-3.1-8b-instruct:free";
const LLM_VISION_MODEL = process.env.LLM_VISION_MODEL || "";
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
const DOCTOR_PATIENT_LINK_TTL_HOURS = Number(process.env.DOCTOR_PATIENT_LINK_TTL_HOURS || 24);

const SUPERADMIN_EMAIL =
  (process.env.SUPERADMIN_EMAIL || "superadmin@medical-ai.local").toLowerCase();
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || "SuperAdmin123!";
const SUPERADMIN_NAME = process.env.SUPERADMIN_NAME || "Super Admin";
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || "12mb";

module.exports = {
  PORT,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  LLM_PROVIDER,
  LLM_API_KEY,
  LLM_MODEL,
  LLM_VISION_MODEL,
  LLM_BASE_URL,
  LLM_APP_NAME,
  LLM_APP_SITE,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  APP_BASE_URL,
  EMAIL_TOKEN_TTL_MINUTES,
  ASSISTANT_PERSONAS,
  DOCTOR_PATIENT_OTP_TTL_MINUTES,
  DOCTOR_PATIENT_OTP_MAX_ATTEMPTS,
  DOCTOR_PATIENT_LINK_TTL_HOURS,
  SUPERADMIN_EMAIL,
  SUPERADMIN_PASSWORD,
  SUPERADMIN_NAME,
  JSON_BODY_LIMIT,
};
