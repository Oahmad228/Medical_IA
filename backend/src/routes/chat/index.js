const express = require("express");
const { authRequired } = require("../../middleware/auth");
const { chatLimiter } = require("../../middleware/rateLimit");
const {
  listConversations,
  createConversation,
  getConversationMessages,
  deleteConversation,
} = require("./conversations");
const { postMessage } = require("./messages");

/**
 * [Module: src/routes/chat/index.js] createChatRouter
 * Builds the chat router with conversation and message endpoints.
 */
function createChatRouter() {
  const router = express.Router();
  router.get("/conversations", authRequired, listConversations);
  router.post("/conversations", authRequired, createConversation);
  router.get("/conversations/:id/messages", authRequired, getConversationMessages);
  router.delete("/conversations/:id", authRequired, deleteConversation);
  router.post("/conversations/:id/messages", chatLimiter, authRequired, postMessage);
  return router;
}

module.exports = { createChatRouter };
