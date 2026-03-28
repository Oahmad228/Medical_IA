/**
 * [Module: src/services/llm/utils.js]
 * Utilitaires LLM (roles, niveaux d'emotion).
 */

/**
 * Mappe les auteurs stockes vers les roles LLM.
 */
function mapStoredAuthorToLLMRole(author) {
  if (author === "ASSISTANT") return "assistant";
  if (author === "SYSTEM") return "system";
  return "user";
}

/**
 * Normalise un libelle d'emotion en GREEN/ORANGE/RED.
 */
function parseEmotionLevel(raw) {
  const text = String(raw || "").trim().toUpperCase();
  if (text.includes("RED")) return "RED";
  if (text.includes("ROUGE")) return "RED";
  if (text.includes("ORANGE")) return "ORANGE";
  if (text.includes("JAUNE")) return "ORANGE";
  if (text.includes("GREEN")) return "GREEN";
  if (text.includes("VERT")) return "GREEN";
  return null;
}

module.exports = { mapStoredAuthorToLLMRole, parseEmotionLevel };
