const express = require("express");
const cors = require("cors");
const { JSON_BODY_LIMIT } = require("./config/env");
const { createHealthRouter } = require("./routes/health");
const { createAuthRouter } = require("./routes/auth");
const { createAccountRouter } = require("./routes/account");
const { createAdminRouter } = require("./routes/admin");
const { createChatRouter } = require("./routes/chat");
const { createPatientRouter } = require("./routes/patient");
const { createDoctorRouter } = require("./routes/doctor");
const { createAppointmentsRouter } = require("./routes/appointments");

/**
 * [Module: src/app.js] createApp
 * Builds and configures the Express application.
 */
function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use(createHealthRouter());
  app.use("/auth", createAuthRouter());
  app.use("/auth", createAccountRouter());
  app.use("/admin", createAdminRouter());
  app.use("/chat", createChatRouter());
  app.use(createPatientRouter());
  app.use(createDoctorRouter());
  app.use(createAppointmentsRouter());

  app.use((_req, res) => {
    res.status(404).json({ error: "Route non trouvee" });
  });

  return app;
}

module.exports = { createApp };
