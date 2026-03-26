const { isGreetingOnly } = require("../utils/normalize");
const { normalizeAssistantPersona } = require("../utils/persona");

/**
 * [Module: src/services/assistantFallbackService.js] composePatientAssistantReply
 * Builds a deterministic fallback reply when the patient LLM fails.
 */
function composePatientAssistantReply({ message, triage, specialist, doctors, patientPersona }) {
  if (isGreetingOnly(message)) {
    return [
      "Bonjour, je suis la pour vous aider (en douceur et avec prudence).",
      "Decrivez-moi ce que vous ressentez depuis quand, et ce qui aggrave ou soulage la douleur.",
      "Exemple: type de douleur, localisation, fievre, vomissements, saignement, grossesse, traitement deja pris.",
    ].join("\n\n");
  }

  const doctorsText =
    doctors.length === 0
      ? "Aucun medecin proche propose pour le moment (ajoutez une localisation)."
      : doctors
          .map(
            (d, index) =>
              `${index + 1}. ${d.name} - ${d.address}${d.rating ? ` (note ${d.rating})` : ""}`
          )
          .join("\n");

  const severityText =
    triage.triage === "RED"
      ? "Le niveau de preoccupation est eleve, il faut agir rapidement."
      : triage.triage === "ORANGE"
      ? "Le niveau de preoccupation est intermediaire et merite une consultation rapide."
      : "Le niveau de preoccupation est faible pour le moment, avec surveillance.";

  const explainedSummary = `${triage.summary}. En mots simples: cela signifie qu'il peut y avoir un probleme de sante a surveiller selon vos symptomes.`;
  const personaLine = patientPersona
    ? `Votre assistant (${normalizeAssistantPersona(patientPersona).replace(/_/g, " ").toLowerCase()}) vous guide pas a pas.`
    : "";

  const rendezVousLine =
    triage.triage === "RED" || triage.triage === "ORANGE"
      ? "Si vous le souhaitez, ajoutez votre localisation puis utilisez le bouton 'Rendez-vous' pour demarrer une consultation via l'app."
      : null;

  return [
    `Je comprends, merci pour votre message. ${severityText}`,
    personaLine,
    `Ce que j'ai compris: ${explainedSummary}`,
    `Ce que je vous conseille maintenant: ${triage.guidance} ${triage.nextStep}`,
    `Medecin a consulter en priorite: ${specialist}.`,
    rendezVousLine,
    `Options de praticiens: ${doctorsText}`,
    "Si vous voulez, je peux vous poser 3 questions courtes pour mieux preciser la situation.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * [Module: src/services/assistantFallbackService.js] composeDoctorAssistantReply
 * Builds a deterministic fallback reply when the doctor LLM fails.
 */
function composeDoctorAssistantReply({ triage, clinicalSummary, hypotheses }) {
  const triageText =
    triage === "RED"
      ? "Vigilance haute. Prise en charge urgente necessaire."
      : triage === "ORANGE"
      ? "Vigilance intermediaire. Consultation rapide recommandee."
      : "Vigilance faible. Surveillance clinique conseillee.";

  return [
    `Synthese: ${clinicalSummary}`,
    `Niveau de vigilance: ${triageText}`,
    `Hypotheses: ${Array.isArray(hypotheses) ? hypotheses.join(" | ") : "N/A"}`,
    "A verifier: constantes vitales, facteurs de risque, evolution rapide.",
    "Message patient: rassurer sans banaliser, expliquer les prochaines etapes.",
  ].join("\n\n");
}

module.exports = { composePatientAssistantReply, composeDoctorAssistantReply };
