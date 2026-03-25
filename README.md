# Medical AI – Dual Agent System

## 1. Introduction

Ce projet vise à développer un **système d'assistance médicale basé sur l'intelligence artificielle** capable d'aider les patients à comprendre leurs symptômes et d'assister les médecins dans l'analyse d'informations cliniques.

L'objectif principal est de créer un système composé de **deux agents IA spécialisés** :

- **Agent Patient** : interagit avec les patients, analyse les symptômes, pose des questions et oriente.
- **Agent Médecin** : assiste le médecin (synthèse, hypothèses prudentes, points de vigilance, vulgarisation).

Ce projet est développé dans un **contexte académique** afin de démontrer l'utilisation de l'IA dans le domaine médical.

⚠️ Ce système **ne remplace pas un médecin**. Il s'agit uniquement d'un outil d'assistance.

---

## 2. Objectif du projet

Le projet vise à créer une application capable de :

- analyser les symptômes décrits par un patient
- déterminer le niveau d'urgence (triage)
- proposer des conseils simples et prudents
- orienter vers un spécialiste si nécessaire
- localiser des médecins proches du patient (optionnel)
- assister les médecins dans l'analyse des informations médicales
- vulgariser les informations médicales pour les patients

---

## 3. Architecture générale du système

Le système repose sur trois composants principaux.

### 1️⃣ Agent IA Patient

Cet agent interagit directement avec le patient.

Fonctions principales :

- compréhension des symptômes
- questions complémentaires
- triage médical (GREEN / ORANGE / RED)
- conseils simples
- orientation vers un spécialiste
- recherche de médecins proches (si Google Places configuré)

Exemple :

Patient :

> "J'ai mal à la tête depuis 3 jours."

L'agent va :

- analyser la description
- poser des questions complémentaires
- déterminer le niveau d'urgence
- proposer des recommandations

---

### 2️⃣ Agent IA Médecin

Cet agent est destiné aux médecins.

Fonctions principales :

- analyser les informations fournies
- produire une synthèse concise
- proposer des hypothèses prudentes
- suggérer ce qu’il faut vérifier en priorité
- générer une explication simple pour le patient

Le médecin garde **toujours la décision finale**.

---

### 3️⃣ Backend Orchestrateur

Le backend agit comme le **coordinateur du système** :

- gestion des sessions et des rôles (PATIENT / DOCTOR / SUPERADMIN)
- stockage (Prisma + SQLite)
- triage par règles
- appels LLM (OpenRouter/Groq) pour des conversations naturelles
- endpoints d'auth, d'admin, et de chat

---

## 4. Fonctionnalités principales

### 4.1 Analyse des symptômes

Le patient peut décrire ses symptômes en langage naturel.

Exemple :

```text
J'ai une douleur au ventre depuis hier soir.
```

Le système va :

1. analyser la description
2. poser des questions supplémentaires si nécessaire
3. déterminer le niveau d'urgence

---

### 4.2 Système de triage médical

Les cas sont classés selon trois niveaux :

- **🟢 GREEN (faible gravité)** : surveillance / conseils généraux
- **🟠 ORANGE (consultation recommandée)** : consultation rapide
- **🔴 RED (urgence)** : recommandation d’urgence immédiate

---

### 4.3 Orientation vers un spécialiste

Si nécessaire, l'agent patient suggère un type de médecin :

- médecin généraliste
- dermatologue
- cardiologue
- ORL
- neurologue

---

### 4.4 Localisation des médecins (optionnel)

Le système peut utiliser **Google Maps / Google Places API** pour :

- trouver des médecins proches
- récupérer des informations (nom, adresse, note)

---

### 4.5 Assistance pour les médecins

Le médecin peut :

- consulter les échanges enregistrés
- obtenir une synthèse et des points de vigilance
- recevoir une explication “patient-friendly”

---

### 4.6 Vulgarisation médicale

Le système transforme des termes médicaux en explications simples.

Exemple :

> "Inflammation des voies respiratoires supérieures."

Devient :

> "Il s'agit probablement d'une irritation ou d'une infection légère des voies respiratoires."

---

## 5. Technologies utilisées

### Backend

- Node.js
- Express.js
- Prisma
- SQLite

### Frontend

- React (Vite)

### IA

- **Triage par règles** (déterministe, sécurité)
- **LLM** (OpenRouter ou Groq) pour une conversation naturelle et contextuelle

---

## 6. Endpoints principaux (actuels)

### Health

- `GET /health`

### Auth

- `POST /auth/signup/patient`
- `POST /auth/signup/doctor`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/verify-email/request`
- `POST /auth/verify-email/confirm`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`

### Chat

- `GET /chat/conversations`
- `POST /chat/conversations`
- `GET /chat/conversations/:id/messages`
- `POST /chat/conversations/:id/messages`

### Admin (superadmin)

- `GET /admin/doctor-requests?status=PENDING|ACTIVE|REJECTED`
- `POST /admin/doctor-requests/:userId/approve`
- `POST /admin/doctor-requests/:userId/reject`

### Patients

- `GET /patients/:id/history`

---

## 7. Structure du projet

```text
Medical_IA/
├─ backend/
│  ├─ prisma/schema.prisma
│  └─ server.js
├─ frontend/
│  └─ src/
│     ├─ App.jsx
│     └─ styles.css
├─ ai/
├─ docs/
└─ eval/
```

---

## 8. Démarrage

### Backend

Depuis `backend/` :

```bash
npm install
npm run prisma:generate
npm run prisma:push
npm run dev
```

Backend actif sur `http://localhost:3001`.

### Frontend

Depuis `frontend/` :

```bash
npm install
npm run dev
```

Frontend Vite par défaut sur `http://localhost:5173`.

---

## 9. Variables d'environnement (backend)

Exemple minimal (OpenRouter) :

```dotenv
AI_MODE=live
DATABASE_URL="file:./dev.db"
LLM_PROVIDER=openrouter
LLM_API_KEY=sk-or-v1-...
LLM_MODEL=mistralai/mistral-small-3.1-24b-instruct:free
APP_BASE_URL=http://localhost:5173
```

Optionnel :

- `GOOGLE_MAPS_API_KEY` (pour la recherche de médecins)
- `SMTP_*` (pour verification email + reset password)

---

## 10. Limites du projet

Ce projet est un **prototype académique** :

- non certifié médicalement
- recommandations générales et prudentes
- sécurité simplifiée (sessions en mémoire, prototype)
- pas de diagnostic clinique

