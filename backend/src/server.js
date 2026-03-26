const { PORT } = require("./config/env");
const { createApp } = require("./app");
const { ensureSuperAdminSeed } = require("./services/adminService");

/**
 * [Module: src/server.js] startServer
 * Seeds admin data then starts the HTTP server.
 */
function startServer() {
  const app = createApp();

  ensureSuperAdminSeed().catch((error) => {
    // Continue even if seed fails (dev-friendly).
    console.error("[seed] superadmin init failed:", error.message || error);
  });

  app.listen(PORT, () => {
    console.log(`Medical AI backend listening on port ${PORT}`);
  });
}

startServer();
