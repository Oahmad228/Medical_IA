/**
 * [Module: src/services/llm/messages.js]
 * Constructeurs de messages systeme pour l'agent LLM.
 */

/**
 * Construit les messages LLM pour l'assistant patient.
 */
function buildPatientAgentMessages({ systemPrompt, historyMessages, triageContext }) {
  return [
    { role: "system", content: systemPrompt },
    ...(Array.isArray(historyMessages) ? historyMessages : []),
    { role: "system", content: triageContext },
  ];
}

/**
 * Construit les messages LLM pour l'assistant medecin.
 */
function buildDoctorAgentMessages({ systemPrompt, historyMessages, clinicalContext }) {
  return [
    { role: "system", content: systemPrompt },
    ...(Array.isArray(historyMessages) ? historyMessages : []),
    { role: "system", content: clinicalContext },
  ];
}

module.exports = { buildPatientAgentMessages, buildDoctorAgentMessages };
