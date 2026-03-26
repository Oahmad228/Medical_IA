const { ASSISTANT_PERSONAS } = require("../config/env");

/**
 * [Module: src/utils/persona.js] normalizeAssistantPersona
 * Normalizes persona input and falls back to DOCTOR when invalid.
 */
function normalizeAssistantPersona(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return ASSISTANT_PERSONAS.includes(normalized) ? normalized : "DOCTOR";
}

/**
 * [Module: src/utils/persona.js] assistantPersonaToStyle
 * Maps persona codes to LLM system style instructions.
 */
function assistantPersonaToStyle(persona) {
  const key = normalizeAssistantPersona(persona);
  if (key === "NURSE") {
    return "Ton d'infirmier: rassurant, oriente actions concretes, patient et attentif.";
  }
  if (key === "OWL") {
    return "Ton hibou (OWL): pedagogique, encourage l'observation, explique simplement sans dramatiser.";
  }
  if (key === "RESCUE_DOG") {
    return "Ton chien de secours: protecteur, motivant, clair sur les gestes a faire en cas d'alerte.";
  }
  return "Ton docteur: empathique, prudent, et oriente vers les prochaines etapes.";
}

module.exports = { normalizeAssistantPersona, assistantPersonaToStyle };
