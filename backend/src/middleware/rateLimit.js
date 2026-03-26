const rateLimit = require("express-rate-limit");

/**
 * [Module: src/middleware/rateLimit.js] createAuthLimiter
 * Rate limit for authentication endpoints to slow brute-force attempts.
 */
function createAuthLimiter() {
  return rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/**
 * [Module: src/middleware/rateLimit.js] createChatLimiter
 * Rate limit for chat message endpoints to protect the LLM API.
 */
function createChatLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

const authLimiter = createAuthLimiter();
const chatLimiter = createChatLimiter();

module.exports = { authLimiter, chatLimiter };
