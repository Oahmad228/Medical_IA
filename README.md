# Medical AI

Assistant medical a deux agents (patient et medecin) pour le triage, la synthese clinique et le suivi des rendez-vous.

Documentation detaillee:

- [docs/project_overview.md](docs/project_overview.md)
- [docs/architecture.md](docs/architecture.md)

## Table des matieres

- Apercu
- Fonctionnalites
- Stack technique
- Prerequis
- Installation et lancement
- Variables d'environnement
- Scripts utiles
- Structure du projet
- Depannage
- Limites et avertissement
- Licence

## Apercu

Medical AI fournit:

- un agent patient pour analyser des symptomes et produire un triage (GREEN/ORANGE/RED)
- un agent medecin pour synthese, recommandations et validation de rapport
- un backend d'orchestration (auth, roles, conversation, rapports, rendez-vous)

## Fonctionnalites

- Analyse des symptomes en langage naturel
- Triage medical (GREEN/ORANGE/RED)
- Conseils prudents et orientation vers specialiste
- Liaison medecin/patient via OTP (email)
- Rapports medecin avec validation avant diffusion au patient
- Rendez-vous patient et medecin
- Geolocalisation et carte Mapbox (cabinet + position patient)
- Recherche de medecins proches (OpenStreetMap)

## Stack technique

- Backend: Node.js, Express, Prisma, SQLite
- Frontend: React (Vite)
- IA: triage par regles + LLM (OpenRouter ou Groq)

## Prerequis

- Node.js 18+
- npm (fourni avec Node)

## Installation et lancement

### 1) Backend

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:push
npm run dev
```

Backend: http://localhost:3001

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173 (ou un autre port si deja pris)

## Variables d'environnement

Backend (backend/.env):

```dotenv
DATABASE_URL="file:./dev.db"
LLM_PROVIDER=openrouter
LLM_API_KEY=sk-or-v1-...
LLM_MODEL=mistralai/mistral-small-3.1-24b-instruct:free
APP_BASE_URL=http://localhost:5173
```

Optionnel:

- SMTP_* (verification email + reset password)

Frontend (frontend/.env):

```dotenv
VITE_API_BASE_URL=http://localhost:3001
VITE_MAPBOX_TOKEN=pk.eyJ...
VITE_MAPBOX_STYLE=mapbox://styles/your-style-id
```

Notes:

- Mapbox necessite un token valide.
- Si VITE_MAPBOX_STYLE est absent, un style par defaut est utilise.

## Scripts utiles

Backend:

- `npm run dev`
- `npm run prisma:generate`
- `npm run prisma:push`

Frontend:

- `npm run dev`
- `npm run build`
- `npm run preview`

## Structure du projet

```text
Medical_IA/
├─ backend/
│  ├─ prisma/
│  └─ src/
├─ frontend/
│  └─ src/
├─ ai/
├─ docs/
└─ eval/
```

## Depannage

- Ecran blanc: ouvrir la console navigateur et verifier les erreurs JS.
- Carte vide Mapbox: verifier le token et desactiver AdBlock pour api.mapbox.com / events.mapbox.com.
- Port 5173 occupe: Vite affiche l'URL exacte au demarrage.
- Prisma: relancer `npm run prisma:push` si la base est desynchronisee.

## Limites et avertissement

Ce projet est un prototype academique. Il ne remplace pas un medecin.

## Licence

Non specifiee.

