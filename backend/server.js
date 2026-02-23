/**
 * Fonction utilitaire : détecter les RED FLAGS (urgence absolue)
 */
function detectRedFlags(message) {
  const text = message.toLowerCase();

  // Douleur thoracique + essoufflement
  if (
    text.includes("douleur thorac") ||
    text.includes("essouff")
  ) {
    return "Possible urgence cardiaque ou respiratoire";
  }

  // Symptômes AVC
  if (
    text.includes("visage tombe") ||
    text.includes("difficulté à parler") ||
    text.includes("bras faible")
  ) {
    return "Suspicion d'AVC (accident vasculaire cérébral)";
  }

  // Réaction allergique grave
  if (
    text.includes("lèvres gonfl") ||
    text.includes("gonflement visage") ||
    text.includes("difficulté à respirer")
  ) {
    return "Suspicion de réaction allergique sévère";
  }

  // Saignement important
  if (
    text.includes("saigne beaucoup") ||
    text.includes("hémorragie")
  ) {
    return "Saignement important nécessitant prise en charge urgente";
  }

  return null;
}

/**
 * ENDPOINT AGENT PATIENT
 * Ce endpoint applique les règles de triage médical simplifiées.
 */
app.post("/ai/patient", async (req, res) => {
  const { message } = req.body || {};

  // Vérification si le message est absent
  if (!message) {
    return res.status(400).json({
      error: "Champ 'message' manquant"
    });
  }

  // Détection des red flags
  const redFlag = detectRedFlags(message);

  if (redFlag) {
    return res.json({
      triage: "RED",
      summary: redFlag,
      guidance: "⚠️ Ceci peut être une urgence médicale. Veuillez contacter immédiatement les services d'urgence ou vous rendre aux urgences les plus proches.",
      nextStep: "Ne pas attendre. Consulter immédiatement."
    });
  }

  // Sinon cas non urgent pour le moment
  return res.json({
    triage: "GREEN",
    summary: "Aucun signe d'urgence immédiate détecté.",
    guidance: "Surveillez vos symptômes, reposez-vous et hydratez-vous si nécessaire.",
    nextStep: "Consultez un médecin si les symptômes persistent ou s'aggravent."
  });
});