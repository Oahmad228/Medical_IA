const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 3001);
const AI_MODE = (process.env.AI_MODE || "mock").toLowerCase();
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

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
  { terms: ["peau", "rash", "eczema", "allergie cutanee"], specialist: "dermatologue" },
  { terms: ["gorge", "oreille", "nez", "sinus"], specialist: "ORL" },
  { terms: ["tete", "migraine", "vertige"], specialist: "neurologue" },
  { terms: ["ventre", "estomac", "nausee", "digestion"], specialist: "gastro-enterologue" },
];

function normalize(text) {
  return (text || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasAnyTerm(text, terms) {
  return terms.some((term) => text.includes(normalize(term)));
}

function detectTriage(message) {
  const text = normalize(message);

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

function recommendSpecialist(message) {
  const text = normalize(message);

  for (const rule of SPECIALIST_RULES) {
    if (hasAnyTerm(text, rule.terms)) {
      return rule.specialist;
    }
  }

  return "medecin generaliste";
}

function getMockDoctors(specialist, near) {
  return [
    {
      name: `Cabinet ${specialist} Centre`,
      address: near ? `${near} - Centre` : "Centre-ville",
      phone: "+212 5 22 00 00 01",
      rating: 4.6,
    },
    {
      name: `Clinique ${specialist} Horizon`,
      address: near ? `${near} - Quartier Nord` : "Quartier Nord",
      phone: "+212 5 22 00 00 02",
      rating: 4.4,
    },
    {
      name: `Dr. ${specialist} Atlas`,
      address: near ? `${near} - Quartier Sud` : "Quartier Sud",
      phone: "+212 5 22 00 00 03",
      rating: 4.2,
    },
  ];
}

async function searchDoctorsFromGoogle({ specialist, near }) {
  const query = `${specialist} pres de ${near}`;

  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("type", "doctor");
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Places request failed (${response.status})`);
  }

  const payload = await response.json();
  if (payload.status !== "OK" && payload.status !== "ZERO_RESULTS") {
    throw new Error(`Google Places error: ${payload.status}`);
  }

  const results = Array.isArray(payload.results) ? payload.results : [];

  return results.slice(0, 5).map((doctor) => ({
    name: doctor.name || "Nom indisponible",
    address: doctor.formatted_address || "Adresse indisponible",
    phone: "Non fourni par cette route API",
    rating: doctor.rating || null,
  }));
}

async function ensurePatientExists(patientId) {
  if (!patientId) {
    return null;
  }

  const patient = await prisma.patient.findUnique({ where: { id: Number(patientId) } });
  if (!patient) {
    throw new Error("Patient introuvable pour le patientId fourni.");
  }

  return patient;
}

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({
      status: "ok",
      service: "medical-ai-backend",
      aiMode: AI_MODE,
      database: "connected",
    });
  } catch (_error) {
    return res.status(500).json({
      status: "error",
      service: "medical-ai-backend",
      aiMode: AI_MODE,
      database: "disconnected",
    });
  }
});

app.get("/", (_req, res) => {
  res.json({
    service: "medical-ai-backend",
    message: "API operationnelle",
    endpoints: [
      "GET /health",
      "POST /patients",
      "GET /patients/:id/history",
      "POST /ai/patient",
      "POST /ai/doctor",
    ],
  });
});

app.post("/patients", async (req, res) => {
  try {
    const { fullName, age, sex } = req.body || {};

    if (!fullName || typeof fullName !== "string") {
      return res.status(400).json({ error: "Le champ 'fullName' est requis." });
    }

    const patient = await prisma.patient.create({
      data: {
        fullName: fullName.trim(),
        age: Number.isInteger(age) ? age : null,
        sex: typeof sex === "string" ? sex.trim() : null,
      },
    });

    return res.status(201).json(patient);
  } catch (error) {
    return res.status(500).json({ error: "Erreur creation patient", details: error.message });
  }
});

app.get("/patients/:id/history", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "ID patient invalide." });
    }

    const patient = await prisma.patient.findUnique({
      where: { id },
      include: {
        symptomReports: { orderBy: { createdAt: "desc" } },
        doctorAnalyses: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!patient) {
      return res.status(404).json({ error: "Patient introuvable." });
    }

    return res.json(patient);
  } catch (error) {
    return res.status(500).json({ error: "Erreur lecture historique", details: error.message });
  }
});

app.post("/ai/patient", async (req, res) => {
  try {
    const { message, location, patientId } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Le champ 'message' est requis et doit etre une chaine de caracteres.",
      });
    }

    await ensurePatientExists(patientId);

    const triage = detectTriage(message);
    const specialist = recommendSpecialist(message);

    let doctors = [];
    if (location && typeof location === "string" && location.trim()) {
      if (AI_MODE === "live" && GOOGLE_MAPS_API_KEY) {
        try {
          doctors = await searchDoctorsFromGoogle({
            specialist,
            near: location.trim(),
          });
        } catch (_error) {
          doctors = getMockDoctors(specialist, location.trim());
        }
      } else {
        doctors = getMockDoctors(specialist, location.trim());
      }
    }

    const payload = {
      triage,
      specialist,
      doctors,
      meta: {
        mode: AI_MODE,
        usedGooglePlaces: AI_MODE === "live" && Boolean(GOOGLE_MAPS_API_KEY),
      },
    };

    await prisma.symptomReport.create({
      data: {
        patientId: Number.isInteger(Number(patientId)) ? Number(patientId) : null,
        message,
        location: location || null,
        triageLevel: triage.triage,
        triageSummary: triage.summary,
        guidance: triage.guidance,
        nextStep: triage.nextStep,
        specialist,
        doctorsJson: JSON.stringify(doctors),
        aiMode: AI_MODE,
        usedGooglePlace: payload.meta.usedGooglePlaces,
      },
    });

    return res.json(payload);
  } catch (error) {
    return res.status(500).json({
      error: "Erreur interne sur /ai/patient",
      details: error.message,
    });
  }
});

app.post("/ai/doctor", async (req, res) => {
  try {
    const { patientId, patientProfile, triage, symptoms, medicalData } = req.body || {};

    await ensurePatientExists(patientId);

    const profileText = patientProfile || "Profil patient non precise";
    const symptomsText = symptoms || "Symptomes non precises";
    const triageLevel = triage || "NON_SPECIFIE";
    const dataText = medicalData || "Aucune donnee medicale additionnelle";

    const clinicalSummary = [
      `Profil: ${profileText}`,
      `Niveau de triage: ${triageLevel}`,
      `Symptomes rapportes: ${symptomsText}`,
      `Donnees complementaires: ${dataText}`,
    ].join(" | ");

    const hypotheses =
      triageLevel === "RED"
        ? [
            "Scenario potentiellement critique a evaluer immediatement",
            "Verifier les constantes vitales et signes d'alerte",
          ]
        : triageLevel === "ORANGE"
        ? [
            "Pathologie non critique mais necessitant examen clinique",
            "Evaluer infection, inflammation ou cause fonctionnelle",
          ]
        : [
            "Atteinte a priori benigne selon les informations disponibles",
            "Surveillance clinique et reevaluation si persistance",
          ];

    const patientFriendlyExplanation =
      triageLevel === "RED"
        ? "Vos symptomes peuvent correspondre a une situation urgente. Il faut consulter rapidement un service d'urgence pour un examen complet."
        : triageLevel === "ORANGE"
        ? "Vos symptomes ne semblent pas immediatement critiques, mais une consultation medicale est recommandee prochainement."
        : "Vos symptomes semblent de faible gravite pour le moment. Continuez a surveiller votre etat et consultez en cas d'aggravation.";

    const payload = {
      clinicalSummary,
      hypotheses,
      patientFriendlyExplanation,
      disclaimer:
        "Aide a la decision uniquement. La decision medicale finale appartient au professionnel de sante.",
    };

    await prisma.doctorAnalysis.create({
      data: {
        patientId: Number.isInteger(Number(patientId)) ? Number(patientId) : null,
        patientProfile: profileText,
        triageLevel,
        symptoms: symptomsText,
        medicalData: medicalData || null,
        clinicalSummary,
        hypothesesJson: JSON.stringify(hypotheses),
        patientFriendlyExplanation,
      },
    });

    return res.json(payload);
  } catch (error) {
    return res.status(500).json({
      error: "Erreur interne sur /ai/doctor",
      details: error.message,
    });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Route non trouvee" });
});

async function startServer() {
  try {
    await prisma.$connect();
    app.listen(PORT, () => {
      console.log(`Medical AI backend running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Unable to start server:", error.message);
    process.exit(1);
  }
}

startServer();

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
