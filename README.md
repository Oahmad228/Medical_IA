# 🏥 MEDICAL AI - Plateforme Collaborative

Bienvenue sur le dépôt officiel du projet **MEDICAL AI**. Notre plateforme vise à révolutionner le parcours de santé en connectant intelligemment patients et médecins grâce à une assistance IA fiable et innovante.

---

## 🚀 Aperçu du Projet
MEDICAL AI est un assistant médical à deux agents conçu pour optimiser le triage, la synthèse clinique et le suivi des rendez-vous médicaux.

### Fonctionnalités Clés :
- **Analyse des symptômes** : Interprétation en langage naturel pour un pré-diagnostic rapide.
- **Triage intelligent** : Classification par code couleur (VERT/ORANGE/ROUGE) selon la gravité.
- **Liaison Patient/Médecin** : Communication sécurisée via OTP (email).
- **Gestion des rapports** : Synthèse clinique générée par IA et validée par le médecin.
- **Suivi des rendez-vous** : Système de calendrier intégré pour patients et praticiens.
- **Géolocalisation** : Recherche de médecins et cabinets à proximité via Mapbox & OpenStreetMap.

---

## 👥 L'Équipe
Le projet est porté par une équipe multidisciplinaire dédiée :
- **Israe Benboujema** : Chef de Projet
- **AmineAhmed Ouerdraogo** : Développeur en Chef
- **Fadwa Es-sahli** : Communication Manager
- **Fatoumata Diaraye Barry** : Rédacteur Technique

---

## 🛠️ Stack Technique
- **Frontend** : HTML5, CSS3 (Tailwind CSS), JavaScript (Vanilla), React (Vite).
- **Backend** : Node.js, Express, Prisma.
- **Base de données** : SQLite (Prisma ORM).
- **Intelligence Artificielle** : Triage par règles + LLM (OpenRouter / Groq).
- **Cartographie** : Mapbox API & OpenStreetMap.

---

## ⚙️ Installation et Lancement

### Prérequis
- Node.js 18+
- npm (fourni avec Node)

### 1. Backend
```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:push
npm run dev
```
*L'API sera accessible sur `http://localhost:3001`*

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```
*L'interface sera accessible sur `http://localhost:5173`*

---

## 📂 Structure du Projet
```text
Medical_IA/
├─ backend/       # Serveur Node.js & Prisma
├─ frontend/      # Application React (Vite)
├─ ai/            # Logique des agents IA
├─ docs/          # Documentation détaillée
└─ eval/          # Scripts d'évaluation
```

---

## 🎓 Partenaires & Institutions
Ce projet est réalisé en collaboration avec :
- **École High-Tech**
- **Université Claude Bernard Lyon 1**

---

## ⚠️ Avertissement
Ce projet est un **prototype académique**. Il a pour but de démontrer les capacités de l'IA dans le domaine de la santé et ne remplace en aucun cas l'avis d'un professionnel de santé certifié.

---
© 2026 MEDICAL AI Lab. Construit pour une collaboration ouverte.
