const { extractAssistantText, callLLM, callLLMStream } = require("./llm/client");
const { buildPatientAgentMessages, buildDoctorAgentMessages } = require("./llm/messages");
const {
  generatePatientAssistantText,
  generateDoctorAssistantText,
  generatePatientReportFromDoctor,
  evaluateCaseEmotionLevel,
  evaluateReportEmotionLevel,
} = require("./llm/generators");
const { mapStoredAuthorToLLMRole, parseEmotionLevel } = require("./llm/utils");

/**
 * [Module: src/services/llmService.js]
 * Facade LLM exportant les fonctions utilitaires.
 */

module.exports = {
  extractAssistantText,
  mapStoredAuthorToLLMRole,
  parseEmotionLevel,
  callLLM,
  callLLMStream,
  buildPatientAgentMessages,
  buildDoctorAgentMessages,
  generatePatientAssistantText,
  generateDoctorAssistantText,
  generatePatientReportFromDoctor,
  evaluateCaseEmotionLevel,
  evaluateReportEmotionLevel,
};
