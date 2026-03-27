const express = require("express");
const { prisma } = require("../db/prisma");
const { LLM_PROVIDER, LLM_API_KEY, LLM_MODEL } = require("../config/env");

/**
 * [Module: src/routes/health.js] rootHandler
 * Lists API metadata and key endpoints at the root path.
 */
function rootHandler(_req, res) {
  res.json({
    service: "medical-ai-backend",
    message: "API operationnelle",
    database: "SQLite via Prisma",
    endpoints: [
      "POST /auth/signup/patient",
      "POST /auth/signup/doctor",
      "POST /auth/login",
      "POST /auth/logout",
      "GET /health",
      "GET /chat/conversations",
      "POST /chat/conversations",
      "GET /chat/conversations/:id/messages",
      "POST /chat/conversations/:id/messages",
      "DELETE /chat/conversations/:id",
      "POST /patient/appointments/request",
      "GET /patient/appointments",
      "POST /patient/appointments/:id/cancel",
      "GET /doctor/appointments",
      "POST /doctor/appointments/:id/accept",
      "POST /doctor/appointments/:id/reject",
      "POST /doctor/appointments/:id/cancel",
      "POST /doctor/appointments/:id/reschedule",
      "GET /admin/doctor-requests",
      "POST /admin/doctor-requests/:userId/approve",
      "POST /admin/doctor-requests/:userId/reject",
    ],
  });
}

/**
 * [Module: src/routes/health.js] healthHandler
 * Performs a lightweight DB check and reports service configuration.
 */
async function healthHandler(_req, res) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({
      status: "ok",
      service: "medical-ai-backend",
      llmProvider: LLM_PROVIDER,
      llmConfigured: Boolean(LLM_API_KEY),
      llmModel: LLM_MODEL,
      database: "connected",
      databaseEngine: "SQLite (Prisma)",
    });
  } catch (_error) {
    return res.status(500).json({
      status: "error",
      service: "medical-ai-backend",
      llmProvider: LLM_PROVIDER,
      llmConfigured: Boolean(LLM_API_KEY),
      llmModel: LLM_MODEL,
      database: "disconnected",
      databaseEngine: "SQLite (Prisma)",
    });
  }
}

/**
 * [Module: src/routes/health.js] createHealthRouter
 * Builds the router for health and root endpoints.
 */
function createHealthRouter() {
  const router = express.Router();
  router.get("/", rootHandler);
  router.get("/health", healthHandler);
  return router;
}

module.exports = { createHealthRouter };
