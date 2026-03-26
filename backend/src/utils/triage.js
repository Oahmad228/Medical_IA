const { normalize, hasAnyTerm, hasAllTermGroups } = require("./normalize");

const TRIAGE_RULES = {
  red: [
    {
      terms: [
        "douleur thorac",
        "douleur poitrine",
        "oppression thoracique",
        "essouff",
        "difficulte a respirer",
        "dyspnee",
      ],
      reason: "Possible urgence cardiaque ou respiratoire",
    },
    {
      terms: [
        "visage tombe",
        "paralysie visage",
        "difficulte a parler",
        "bras faible",
        "faiblesse brutale",
        "suspicion avc",
      ],
      reason: "Suspicion d'AVC (accident vasculaire cerebral)",
    },
    {
      terms: [
        "levres gonfl",
        "gonflement visage",
        "langue gonflee",
        "reaction allergique severe",
      ],
      reason: "Suspicion de reaction allergique severe",
    },
    {
      terms: ["saigne beaucoup", "hemorragie", "perte de sang importante"],
      reason: "Saignement important necessitant prise en charge urgente",
    },
  ],
  orange: [
    {
      terms: ["fievre", "temperature", "39", "38.5"],
      reason: "Fievre persistante ou elevee a surveiller",
    },
    {
      terms: ["douleur persistante", "douleur depuis", "douleur continue"],
      reason: "Douleur persistante qui merite une consultation",
    },
    {
      terms: ["infection", "pus", "inflammation", "frissons"],
      reason: "Signes possibles d'infection",
    },
  ],
};

const SPECIALIST_RULES = [
  { terms: ["coeur", "thorac", "palpitation"], specialist: "cardiologue" },
  {
    terms: ["peau", "rash", "eczema", "allergie cutanee"],
    specialist: "dermatologue",
  },
  { terms: ["gorge", "oreille", "nez", "sinus"], specialist: "ORL" },
  { terms: ["tete", "migraine", "vertige"], specialist: "neurologue" },
  {
    terms: ["ventre", "estomac", "nausee", "digestion"],
    specialist: "gastro-enterologue",
  },
];

/**
 * [Module: src/utils/triage.js] detectTriage
 * Applies rule-based triage to a patient message (RED/ORANGE/GREEN).
 */
function detectTriage(message) {
  const text = normalize(message);

  const emergencyTerms = [
    "je meurs",
    "je vais mourir",
    "je n arrive plus a respirer",
    "je ne peux plus respirer",
    "perte de connaissance",
    "inconscient",
  ];

  const bleedingTerms = [
    "saigne",
    "seigne",
    "saignement",
    "hemorragie",
    "hemoragie",
    "emoragie",
    "perte de sang",
  ];

  const weaknessTerms = [
    "faible",
    "faiblesse",
    "plus la force",
    "plus de force",
    "epuise",
    "je n arrive plus a marcher",
    "ne peux plus marcher",
  ];

  const pregnancyTerms = ["enceinte", "grossesse"];

  const persistentTerms = ["depuis une semaine", "1 semaine", "plusieurs jours"];
  const longDurationTerms = [
    "depuis",
    "jours",
    "jour",
    "semaine",
    "semaines",
    "24 jours",
    "continuellement",
    "continue",
    "continu",
    "en continu",
    "sans arret",
  ];
  const vomitingTerms = ["vomis", "vomissement", "je vomi", "je vomis", "nausee"];

  if (hasAnyTerm(text, emergencyTerms)) {
    return {
      triage: "RED",
      summary: "Declaration explicite de detresse vitale.",
      guidance:
        "Ceci peut etre une urgence medicale. Contactez les services d'urgence ou rendez-vous aux urgences immediatement.",
      nextStep: "Ne pas attendre. Prise en charge immediate.",
    };
  }

  if (hasAllTermGroups(text, [bleedingTerms, weaknessTerms])) {
    return {
      triage: "RED",
      summary: "Saignement associe a une faiblesse importante.",
      guidance:
        "Ceci peut etre une urgence medicale. Contactez les services d'urgence ou rendez-vous aux urgences immediatement.",
      nextStep: "Ne pas attendre. Prise en charge immediate.",
    };
  }

  if (hasAllTermGroups(text, [bleedingTerms, pregnancyTerms])) {
    return {
      triage: "RED",
      summary: "Saignement pendant une grossesse potentielle ou confirmee.",
      guidance:
        "Ceci peut etre une urgence obstetricale. Contactez les urgences immediatement.",
      nextStep: "Prise en charge obstetricale urgente.",
    };
  }

  if (hasAllTermGroups(text, [bleedingTerms, longDurationTerms])) {
    return {
      triage: "RED",
      summary: "Saignement continu ou prolonge signale.",
      guidance:
        "Ce tableau peut relever d'une urgence. Contactez les urgences ou consultez immediatement.",
      nextStep: "Evaluation medicale urgente sans attendre.",
    };
  }

  if (hasAllTermGroups(text, [persistentTerms, vomitingTerms])) {
    return {
      triage: "ORANGE",
      summary: "Vomissements persistants necessitant une evaluation rapide.",
      guidance:
        "Une consultation medicale est recommandee rapidement pour evaluer les risques de dehydration et de complication.",
      nextStep: "Prendre rendez-vous dans les 24 heures, ou plus tot si aggravation.",
    };
  }

  for (const rule of TRIAGE_RULES.red) {
    if (hasAnyTerm(text, rule.terms)) {
      return {
        triage: "RED",
        summary: rule.reason,
        guidance:
          "Ceci peut etre une urgence medicale. Contactez les services d'urgence ou rendez-vous aux urgences immediatement.",
        nextStep: "Ne pas attendre. Prise en charge immediate.",
      };
    }
  }

  for (const rule of TRIAGE_RULES.orange) {
    if (hasAnyTerm(text, rule.terms)) {
      return {
        triage: "ORANGE",
        summary: rule.reason,
        guidance:
          "Une consultation medicale est recommandee dans un delai raisonnable. Surveillez toute aggravation.",
        nextStep: "Prendre rendez-vous avec un medecin dans les 24 a 72 heures.",
      };
    }
  }

  return {
    triage: "GREEN",
    summary: "Aucun signe d'urgence immediate detecte.",
    guidance:
      "Repos, hydratation et surveillance des symptomes. Consulter si aggravation ou persistance.",
    nextStep: "Auto-surveillance et consultation si besoin.",
  };
}

/**
 * [Module: src/utils/triage.js] recommendSpecialist
 * Suggests a specialist based on the message content.
 */
function recommendSpecialist(message) {
  const text = normalize(message);

  for (const rule of SPECIALIST_RULES) {
    if (hasAnyTerm(text, rule.terms)) {
      return rule.specialist;
    }
  }

  return "medecin generaliste";
}

module.exports = { TRIAGE_RULES, SPECIALIST_RULES, detectTriage, recommendSpecialist };
