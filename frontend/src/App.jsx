import { useEffect, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:3001";

async function fetchJson(path, payload, method = "POST") {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Erreur API");
  }

  return data;
}

function pretty(data) {
  return JSON.stringify(data, null, 2);
}

export default function App() {
  const [health, setHealth] = useState("verification...");
  const [healthState, setHealthState] = useState("idle");

  const [patientInput, setPatientInput] = useState({
    message: "",
    location: "",
    patientId: "",
  });
  const [doctorInput, setDoctorInput] = useState({
    patientId: "",
    patientProfile: "",
    triage: "GREEN",
    symptoms: "",
    medicalData: "",
  });
  const [registryInput, setRegistryInput] = useState({
    fullName: "",
    age: "",
    sex: "",
    historyPatientId: "",
  });

  const [registryOutput, setRegistryOutput] = useState(
    "Aucun patient cree pour le moment."
  );
  const [patientOutput, setPatientOutput] = useState(
    "Aucune analyse pour le moment."
  );
  const [doctorOutput, setDoctorOutput] = useState(
    "Aucune synthese pour le moment."
  );

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchJson("/health", undefined, "GET");
        setHealth(`Backend: en ligne (${data.aiMode})`);
        setHealthState("ok");
      } catch (_error) {
        setHealth("Backend: hors ligne (lancer backend/npm start)");
        setHealthState("down");
      }
    })();
  }, []);

  async function onCreatePatient(event) {
    event.preventDefault();
    setRegistryOutput("Creation en cours...");

    try {
      const payload = { fullName: registryInput.fullName.trim() };
      if (registryInput.age.trim()) {
        payload.age = Number(registryInput.age.trim());
      }
      if (registryInput.sex) {
        payload.sex = registryInput.sex;
      }

      const data = await fetchJson("/patients", payload);
      setRegistryOutput(pretty(data));
      setRegistryInput((prev) => ({
        ...prev,
        historyPatientId: String(data.id),
      }));
      setPatientInput((prev) => ({ ...prev, patientId: String(data.id) }));
      setDoctorInput((prev) => ({ ...prev, patientId: String(data.id) }));
    } catch (error) {
      setRegistryOutput(`Erreur: ${error.message}`);
    }
  }

  async function onHistory(event) {
    event.preventDefault();
    setRegistryOutput("Chargement historique...");

    try {
      const id = Number(registryInput.historyPatientId.trim());
      const data = await fetchJson(`/patients/${id}/history`, undefined, "GET");
      setRegistryOutput(pretty(data));
    } catch (error) {
      setRegistryOutput(`Erreur: ${error.message}`);
    }
  }

  async function onPatientAgent(event) {
    event.preventDefault();
    setPatientOutput("Analyse en cours...");

    try {
      const payload = { message: patientInput.message.trim() };
      if (patientInput.location.trim()) {
        payload.location = patientInput.location.trim();
      }
      if (patientInput.patientId.trim()) {
        payload.patientId = Number(patientInput.patientId.trim());
      }

      const data = await fetchJson("/ai/patient", payload);
      setPatientOutput(pretty(data));
    } catch (error) {
      setPatientOutput(`Erreur: ${error.message}`);
    }
  }

  async function onDoctorAgent(event) {
    event.preventDefault();
    setDoctorOutput("Generation en cours...");

    try {
      const payload = {
        patientProfile: doctorInput.patientProfile.trim(),
        triage: doctorInput.triage,
        symptoms: doctorInput.symptoms.trim(),
      };
      if (doctorInput.medicalData.trim()) {
        payload.medicalData = doctorInput.medicalData.trim();
      }
      if (doctorInput.patientId.trim()) {
        payload.patientId = Number(doctorInput.patientId.trim());
      }

      const data = await fetchJson("/ai/doctor", payload);
      setDoctorOutput(pretty(data));
    } catch (error) {
      setDoctorOutput(`Erreur: ${error.message}`);
    }
  }

  return (
    <>
      <div className="bg-shape bg-shape-a" />
      <div className="bg-shape bg-shape-b" />

      <header className="hero">
        <p className="kicker">Prototype Academique</p>
        <h1>Medical AI - Double Agent System</h1>
        <p className="hero-copy">
          Assistant patient pour le triage initial, et assistant medecin pour la
          synthese clinique.
        </p>
        <div className={`health-pill ${healthState}`}>{health}</div>
      </header>

      <main className="layout">
        <section className="card">
          <h2>Gestion Patient</h2>
          <p className="muted">
            Creation de patient et consultation de l'historique stocke en base.
          </p>

          <form className="form-stack" onSubmit={onCreatePatient}>
            <label htmlFor="registry-name">Nom complet</label>
            <input
              id="registry-name"
              type="text"
              required
              value={registryInput.fullName}
              onChange={(e) =>
                setRegistryInput((prev) => ({ ...prev, fullName: e.target.value }))
              }
              placeholder="Ex: Sara El Amrani"
            />

            <label htmlFor="registry-age">Age (optionnel)</label>
            <input
              id="registry-age"
              type="number"
              min="0"
              max="120"
              value={registryInput.age}
              onChange={(e) =>
                setRegistryInput((prev) => ({ ...prev, age: e.target.value }))
              }
              placeholder="Ex: 35"
            />

            <label htmlFor="registry-sex">Sexe (optionnel)</label>
            <select
              id="registry-sex"
              value={registryInput.sex}
              onChange={(e) =>
                setRegistryInput((prev) => ({ ...prev, sex: e.target.value }))
              }
            >
              <option value="">Non specifie</option>
              <option value="F">F</option>
              <option value="M">M</option>
              <option value="Autre">Autre</option>
            </select>

            <button type="submit">Creer patient</button>
          </form>

          <form className="form-stack" onSubmit={onHistory}>
            <label htmlFor="history-id">Patient ID</label>
            <input
              id="history-id"
              type="number"
              min="1"
              required
              value={registryInput.historyPatientId}
              onChange={(e) =>
                setRegistryInput((prev) => ({
                  ...prev,
                  historyPatientId: e.target.value,
                }))
              }
              placeholder="Ex: 2"
            />
            <button type="submit">Voir historique</button>
          </form>

          <pre className="output">{registryOutput}</pre>
        </section>

        <section className="card">
          <h2>Agent Patient</h2>
          <p className="muted">
            Analyse des symptomes, triage, orientation specialiste, medecins
            proches.
          </p>

          <form className="form-stack" onSubmit={onPatientAgent}>
            <label htmlFor="patient-message">Symptomes</label>
            <textarea
              id="patient-message"
              rows="5"
              required
              value={patientInput.message}
              onChange={(e) =>
                setPatientInput((prev) => ({ ...prev, message: e.target.value }))
              }
              placeholder="Ex: J ai une douleur thoracique et je suis essouffle"
            />

            <label htmlFor="patient-id">Patient ID (optionnel)</label>
            <input
              id="patient-id"
              type="number"
              min="1"
              value={patientInput.patientId}
              onChange={(e) =>
                setPatientInput((prev) => ({ ...prev, patientId: e.target.value }))
              }
              placeholder="Ex: 2"
            />

            <label htmlFor="patient-location">Ville / localisation (optionnel)</label>
            <input
              id="patient-location"
              type="text"
              value={patientInput.location}
              onChange={(e) =>
                setPatientInput((prev) => ({ ...prev, location: e.target.value }))
              }
              placeholder="Ex: Casablanca"
            />

            <button type="submit">Analyser</button>
          </form>

          <pre className="output">{patientOutput}</pre>
        </section>

        <section className="card">
          <h2>Agent Medecin</h2>
          <p className="muted">
            Resume clinique et explication patient-friendly a partir des donnees
            fournies.
          </p>

          <form className="form-stack" onSubmit={onDoctorAgent}>
            <label htmlFor="doctor-patient-id">Patient ID (optionnel)</label>
            <input
              id="doctor-patient-id"
              type="number"
              min="1"
              value={doctorInput.patientId}
              onChange={(e) =>
                setDoctorInput((prev) => ({ ...prev, patientId: e.target.value }))
              }
              placeholder="Ex: 2"
            />

            <label htmlFor="doctor-profile">Profil patient</label>
            <input
              id="doctor-profile"
              type="text"
              required
              value={doctorInput.patientProfile}
              onChange={(e) =>
                setDoctorInput((prev) => ({
                  ...prev,
                  patientProfile: e.target.value,
                }))
              }
              placeholder="Ex: Femme 35 ans"
            />

            <label htmlFor="doctor-triage">Triage</label>
            <select
              id="doctor-triage"
              value={doctorInput.triage}
              onChange={(e) =>
                setDoctorInput((prev) => ({ ...prev, triage: e.target.value }))
              }
            >
              <option value="GREEN">GREEN</option>
              <option value="ORANGE">ORANGE</option>
              <option value="RED">RED</option>
            </select>

            <label htmlFor="doctor-symptoms">Symptomes</label>
            <textarea
              id="doctor-symptoms"
              rows="3"
              required
              value={doctorInput.symptoms}
              onChange={(e) =>
                setDoctorInput((prev) => ({ ...prev, symptoms: e.target.value }))
              }
              placeholder="Ex: fievre depuis 3 jours"
            />

            <label htmlFor="doctor-data">Donnees medicales (optionnel)</label>
            <textarea
              id="doctor-data"
              rows="3"
              value={doctorInput.medicalData}
              onChange={(e) =>
                setDoctorInput((prev) => ({ ...prev, medicalData: e.target.value }))
              }
              placeholder="Ex: CRP elevee, tension 13/8"
            />

            <button type="submit">Generer synthese</button>
          </form>

          <pre className="output">{doctorOutput}</pre>
        </section>
      </main>

      <footer className="footer">
        <p>
          Ce prototype ne remplace pas un professionnel de sante. En cas
          d'urgence, appelez les services d'urgence.
        </p>
      </footer>
    </>
  );
}
