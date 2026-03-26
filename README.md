# Medical AI – Dual Agent System

## 1. Introduction

Ce projet vise à développer un **système d'assistance médicale basé sur l'intelligence artificielle** capable d'aider les patients à comprendre leurs symptômes et d'assister les médecins dans l'analyse d'informations cliniques.

L'objectif principal est de créer un système composé de **deux agents IA spécialisés** :

- **Agent Patient** : interagit avec les patients, analyse les symptômes, pose des questions et oriente.
- **Agent Médecin** : assiste le médecin (synthèse, hypothèses prudentes, points de vigilance, vulgarisation).

Ce projet est développé dans un **contexte académique** afin de démontrer l'utilisation de l'IA dans le domaine médical.

⚠️ Ce système **ne remplace pas un médecin**. Il s'agit uniquement d'un outil d'assistance.

Document de cadrage fusionne (version longue): `docs/project_overview.md`
Architecture technique (modules): `docs/architecture.md`

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
4. prendre en compte des images jointes (si fournies, mode live)

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
- valider le rapport avant diffusion côté patient (workflow draft -> approve)

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
- `DELETE /chat/conversations/:id`

### Admin (superadmin)

- `GET /admin/doctor-requests?status=PENDING|ACTIVE|REJECTED`
- `POST /admin/doctor-requests/:userId/approve`
- `POST /admin/doctor-requests/:userId/reject`

### Patients
- `GET /patients/:id/history` (non accessible côté patient)

### Médecin / OTP / Rapports

- `POST /doctor/patient-link/request-otp`
- `POST /doctor/patient-link/confirm-otp`
- `GET /doctor/patient-link/status`
- `GET /doctor/reports/latest`
- `POST /doctor/reports/:reportId/approve`

### Patient / Rapports validés

- `GET /patient/reports/latest`

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

---

## 11. Propositions produit (prochaine étape)

Cette section décrit des **propositions de conception** (sans implémentation immédiate), alignées avec ton besoin: expérience patient plus engageante, et workflow médecin plus strict avant retour au patient.

### 11.1 Expérience Patient uniquement (chibi + niveau de préoccupation)

- Le patient ne voit **pas** le rapport longitudinal interne.
- Le patient voit uniquement:
  - son historique de conversation
  - les réponses de son agent IA
  - un indicateur visuel via mascotte/chibi
- L'indicateur de préoccupation est porté par le comportement du chibi:
  - **GREEN**: posture calme, respiration/méditation, message rassurant
  - **ORANGE**: posture attentive, animation d'analyse, message de vigilance
  - **RED**: posture d'alerte, animation dynamique, message "urgence"

Proposition UI:

- Une carte fixe à droite: personnage + bulle texte courte
- Bulle cliquable pour afficher le détail "ce que le patient doit faire maintenant"
- Pas de jargon médical, consignes simples et actionnables

### 11.2 Choix de l'assistant lors de l'inscription patient

Lors de la création de compte patient, proposer un choix de persona visuel (chibi) qui restera son assistant principal:

- Docteur (humain)
- Infirmier/Infirmière (humain)
- Hibou (animal, calme/observateur)
- Chien de secours (animal, protecteur/alerte)

Règles:

- Valeur par défaut pour les comptes existants: **Docteur**
- Le persona n'impacte pas la logique médicale, uniquement l'UX (avatar, ton de la bulle, animations)
- Le patient peut modifier son persona plus tard dans ses paramètres (option recommandée)

### 11.3 Espace médecin (sans indicateur chibi)

- Le médecin n'a pas d'indicateur "niveau de préoccupation" visuel.
- Il consulte:
  - rapport IA structuré
  - historique clinique utile
  - points de vigilance
- Le médecin garde l'interprétation clinique finale.

### 11.4 Liaison médecin-patient avec OTP

Proposition de flux pour associer un médecin à un patient:

1. Le médecin saisit l'identifiant du patient.
2. Le système envoie un OTP au patient par email.
3. Le médecin renseigne cet OTP pour confirmer l'association.
4. Une fois validé, le médecin accède au rapport IA du patient.

Contraintes de sécurité recommandées:

- OTP court (6 chiffres), expiration rapide (ex: 10 minutes)
- Nombre max d'essais (ex: 5), puis blocage temporaire
- Journalisation des tentatives et confirmations

### 11.5 Double validation du rapport avant retour patient

Workflow cible:

1. L'agent médecin produit une proposition de rapport clinique.
2. Le médecin relit, édite, puis confirme.
3. Seulement après confirmation, une version patient est générée:
   - explication vulgarisée
   - consignes concrètes
   - niveau de priorité compréhensible

Ce mécanisme évite qu'un résumé non validé atteigne le patient.

### 11.6 Restitution au patient (mail + bulle chibi)

Après validation médecin:

- Envoi d'un email patient (résumé + recommandations)
- Affichage d'un message dans l'application via la bulle du chibi
- Le patient clique la bulle pour ouvrir une fenêtre "Ce que mon médecin me recommande"

Contenu minimal affiché au patient:

- Ce qu'il faut faire maintenant
- Signaux d'alerte à surveiller
- Quand recontacter / consulter en urgence
- Spécialiste recommandé (si applicable)

### 11.7 Données et modèle (proposition)

Pour préparer l'implémentation future, prévoir:

- `Patient.assistantPersona` (DOCTOR, NURSE, OWL, RESCUE_DOG)
- `DoctorPatientLink` (doctorId, patientId, status, linkedAt)
- `PairingOtp` (codeHash, expiresAt, attempts, consumedAt)
- `DoctorValidatedReport` (draftByAI, editedByDoctor, approvedAt)
- `PatientFacingReport` (finalText, sentEmailAt, shownInAppAt)

### 11.8 API cible (proposition)

Exemples d'endpoints à planifier:

- `POST /patient/preferences/assistant-persona`
- `POST /doctor/patient-link/request-otp`
- `POST /doctor/patient-link/confirm-otp`
- `POST /doctor/reports/:id/approve`
- `GET /patient/reports/latest`
- `POST /patient/reports/:id/acknowledge`

### 11.9 Plan d'implémentation conseillé

- **Phase 1 (rapide)**: persona patient + UI chibi + défaut "Docteur" pour comptes existants
- **Phase 2 (sécurité)**: liaison médecin-patient par OTP
- **Phase 3 (qualité médicale)**: draft IA médecin + édition + approbation obligatoire
- **Phase 4 (communication)**: génération version patient + email + bulle cliquable

Ce découpage réduit les risques et permet de tester chaque bloc métier séparément.

---

## 12. Etat d'implementation (mars 2026)

Deja en place dans le code:

- Le patient ne voit pas la memoire medicale persistante dans son panneau.
- Memoire medicale persistante (`Patient.medicalMemory`) alimentee au fil des conversations.
- Protection d'acces sur `GET /patients/:id/history` avec controle de role/proprietaire.
- Association medecin/patient via OTP (backend + UI basique cote medecin).
- Creation de rapports patient en mode `DRAFT` puis validation du medecin.
- Exposition du rapport patient uniquement apres validation (`GET /patient/reports/latest`).
- Choix de persona assistant a l'inscription patient (`DOCTOR`, `NURSE`, `OWL`, `RESCUE_DOG`).
- Valeur par defaut pour comptes existants et nouveaux: `DOCTOR`.
- UI patient: carte chibi dynamique selon le niveau (`GREEN`, `ORANGE`, `RED`).
- UI patient: images chibi reelles (assets web telecharges), plus d'emojis.
- UI medecin: indicateur chibi retire, focus sur rapport/analyse textuelle.
- Upload d'images dans le chat (patient et medecin) transmis au contexte IA.

Pas encore implemente (prochaine phase):

- Edition du draft medecin avant validation (UI encore simplifiee).
- Accuse reception patient (marqueur "lu" / "acquitté") et historique de consultation.
- Durcissement securite (audits, journalisation fine des tentatives OTP, suppression des delais sensibles).

