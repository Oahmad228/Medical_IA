const express = require("express");
const { authLimiter } = require("../middleware/rateLimit");
const { authRequired } = require("../middleware/auth");
const { signupPatient, signupDoctor, login, logout } = require("./auth/authHandlers");
const {
  requestVerification,
  confirmVerification,
  forgotPassword,
  resetPassword,
} = require("./auth/emailHandlers");

/**
 * [Module: src/routes/auth.js]
 * Routeur d'authentification (inscriptions, login, emails).
 */

/**
 * [Module: src/routes/auth.js] createAuthRouter
 * Builds the authentication router with signup/login/reset flows.
 */
function createAuthRouter() {
  const router = express.Router();
  router.post("/signup/patient", authLimiter, signupPatient);
  router.post("/signup/doctor", authLimiter, signupDoctor);
  router.post("/login", authLimiter, login);
  router.post("/logout", authRequired, logout);
  router.post("/verify-email/request", requestVerification);
  router.post("/verify-email/confirm", confirmVerification);
  router.post("/forgot-password", forgotPassword);
  router.post("/reset-password", resetPassword);
  return router;
}

module.exports = { createAuthRouter };
