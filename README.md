# Medical AI - Double Agent System

## 1. But du projet

Le projet **Medical AI** vise a creer un systeme d'assistance medicale intelligent qui aide a la fois :

- les patients a mieux decrire leurs symptomes et a comprendre leur situation,
- les medecins a analyser rapidement les informations utiles.

L'objectif n'est pas de remplacer un professionnel de sante, mais de **faciliter l'acces aux soins**, **ameliorer l'orientation** et **renforcer la communication medecin-patient**.

## 2. Fonctionnement general

Le systeme repose sur **deux agents IA interconnectes** et un backend orchestrateur :

1. **Agent Patient** : dialogue avec l'utilisateur, collecte les symptomes, pose des questions complementaires et evalue le niveau d'urgence.
2. **Agent Medecin** : aide le praticien a resumer les donnees, proposer des hypotheses et reformuler les explications en langage simple.
3. **Backend Orchestrateur** : coordonne les appels IA, gere les donnees, et integre les APIs externes (ex. Google Maps).

Flux global :

1. Le patient decrit ses symptomes.
2. L'agent Patient analyse et classe le niveau d'urgence (GREEN, ORANGE, RED).
3. Le systeme propose des conseils et, si necessaire, oriente vers un specialiste.
4. Le systeme peut suggerer des medecins proches via Google Places API.
5. Cote medecin, l'agent Medecin assiste l'analyse du dossier et la vulgarisation des resultats.

## 3. Fonctionnalites principales

### 3.1 Analyse des symptomes

- Saisie libre des symptomes en texte naturel.
- Questions complementaires automatiques.
- Evaluation preliminaire du risque.

### 3.2 Triage medical

- **GREEN** : faible gravite, surveillance et conseils simples.
- **ORANGE** : consultation recommandee a court terme.
- **RED** : urgence, orientation immediate vers une prise en charge adaptee.

### 3.3 Orientation vers specialistes

- Suggestion du type de medecin selon les symptomes : generaliste, cardiologue, ORL, dermatologue, etc.

### 3.4 Recherche de medecins proches

- Integration Google Places API pour recuperer :
	- nom,
	- adresse,
	- telephone,
	- note.

### 3.5 Assistance clinique pour le medecin

- Resume des symptomes et de l'historique.
- Aide a la formulation d'hypotheses.
- Generation d'une explication claire pour le patient.

### 3.6 Vulgarisation medicale

- Traduction d'un langage medical complexe vers une formulation simple et comprensible.

## 4. Architecture technique

Structure du projet :

```text
Medical_IA/
|- frontend/
|- backend/
|- docs/
|- ai/
`- eval/
```

Composants techniques cibles :

- **Backend** : Node.js + Express.js
	- Endpoints principaux : `/ai/patient`, `/ai/doctor`
- **Base de donnees (evolution)** : Prisma + MySQL (ou SQLite en phase initiale)
- **Frontend (evolution)** : React.js avec deux interfaces (patient et medecin)
- **APIs externes** : Google Maps Platform (Places API)
- **Moteur IA** :
	- Regles deterministes pour triage et red flags,
	- IA generative (etape future) pour conversation et synthese.

## 5. Comment on va l'implementer

Le developpement est progressif, en 6 phases :

1. **Structure initiale** du depot et des dossiers (`frontend`, `backend`, `docs`, `ai`, `eval`).
2. **Backend minimal** avec Express et endpoints `/ai/patient`, `/ai/doctor`, en mode mock (`AI_MODE=mock`).
3. **Triage base sur regles** pour detecter les red flags et classifier GREEN/ORANGE/RED.
4. **Integration Google Places API** pour localiser des praticiens proches.
5. **Persistance des donnees** avec Prisma + base SQL (patients, symptomes, consultations).
6. **Interface React** :
	 - Vue patient : saisie des symptomes, conseils, medecins proches.
	 - Vue medecin : synthese du dossier, aide a l'explication.

## 6. Limites du projet

Ce projet est un **prototype academique**. Limites principales :

1. **Non certifie medicalement** : le systeme ne remplace jamais un medecin.
2. **IA simplifiee** : regles + modeles generaux, sans valeur de diagnostic clinique officiel.
3. **Couverture medicale limitee** : conseils generalistes et prudents.
4. **Securite et conformite partielles** : gestion des donnees simplifiee dans cette phase.

## Conclusion

Medical AI propose une approche modulaire d'assistance medicale basee sur deux agents IA specialises :

- un agent oriente patient,
- un agent oriente medecin.

Le systeme peut evoluer vers une solution plus robuste avec base de connaissances enrichie, meilleure securite des donnees et integration clinique plus avancee.

## Etat actuel fonctionnel

Le backend `Medical_IA/backend` est maintenant fonctionnel avec :

- `GET /health`
- `POST /patients`
- `GET /patients/:id/history`
- `POST /ai/patient`
- `POST /ai/doctor`

Le triage, l'orientation specialiste, la recherche de medecins (mode mock par defaut) et la persistance en base SQLite sont actifs.

## Lancer le projet (backend)

1. Se placer dans `backend/`.
2. Copier `backend/.env.example` vers `backend/.env`.
3. Installer les dependances : `npm install`.
4. Initialiser la base : `npm run prisma:generate` puis `npm run prisma:push`.
5. Lancer : `npm start`.

Le serveur demarre sur `http://localhost:3001` (ou `PORT` si defini).

## Frontend React (Phase 6)

Le frontend est maintenant une application **React + Vite** dans `frontend/` avec :

- Gestion Patient (creation + historique)
- Agent Patient (appel `POST /ai/patient`)
- Agent Medecin (appel `POST /ai/doctor`)

Pour l'utiliser :

1. Lancer le backend (`npm start` dans `backend/`).
2. Dans `frontend/` : `npm install`.
3. Lancer en dev : `npm run dev`.
4. Ouvrir l'URL affichee par Vite (defaut `http://localhost:5173`).

Le frontend pointe vers `http://localhost:3001` par defaut.
Vous pouvez changer l'API avec `frontend/.env` : `VITE_API_BASE_URL=...`.

Le frontend inclut :

- creation de patient,
- consultation de l'historique patient,
- appels Agent Patient et Agent Medecin avec `patientId` optionnel.

## Variables d'environnement

- `PORT` : port HTTP du backend (defaut `3001`).
- `AI_MODE` : `mock` (defaut) ou `live`.
- `GOOGLE_MAPS_API_KEY` : cle Google Places API (utile en mode `live`).
- `DATABASE_URL` : URL SQLite Prisma (defaut `"file:./dev.db"`).

## Exemples d'appels API

### `POST /ai/patient`

```json
{
	"message": "J'ai une douleur thoracique et je suis essouffle",
	"location": "Casablanca"
}
```

Reponse : triage (`GREEN/ORANGE/RED`), specialiste recommande, et liste de medecins.

### `POST /patients`

```json
{
	"fullName": "Sara El Amrani",
	"age": 35,
	"sex": "F"
}
```

Reponse : objet patient avec `id`.

### `GET /patients/:id/history`

Reponse : patient + liste `symptomReports` + liste `doctorAnalyses`.

### `POST /ai/doctor`

```json
{
	"patientProfile": "Homme 52 ans",
	"triage": "RED",
	"symptoms": "douleur thoracique",
	"medicalData": "TA 16/10"
}
```

Reponse : resume clinique, hypotheses et explication vulgarisee pour le patient.
