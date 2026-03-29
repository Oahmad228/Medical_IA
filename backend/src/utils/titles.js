/**
 * [Module: src/utils/titles.js] deriveConversationTitleFromMessage
 * Creates a short title from the first user message for list displays.
 */
function deriveConversationTitleFromMessage(message, { maxLen = 56 } = {}) {
  const raw = String(message || "").trim();
  if (!raw) return "Nouvelle conversation";

  const cleaned = raw
    .replace(/\s+/g, " ")
    .replace(/[\r\n\t]/g, " ")
    .replace(/[^\p{L}\p{N}\s'’,-]/gu, "")
    .trim();

  const snippet = cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1).trim()}…` : cleaned;
  return snippet || "Nouvelle conversation";
}

/**
 * [Module: src/utils/titles.js] isDefaultConversationTitle
 * Checks if the conversation title is still the default placeholder.
 */
function isDefaultConversationTitle(title) {
  const t = String(title || "").trim().toLowerCase();
  return (
    t === "conversation initiale" ||
    t === "nouvelle discussion" ||
    t === "nouvelle discussion patient" ||
    t === "nouvelle conversation" ||
    t === "nouveau dossier clinique" ||
    t === "nouveau dossier"
  );
}

module.exports = { deriveConversationTitleFromMessage, isDefaultConversationTitle };
