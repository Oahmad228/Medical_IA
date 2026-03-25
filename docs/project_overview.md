# Medical AI - Double Agent System (Fusion)

## 1. Contexte et motivation

Dans beaucoup de situations medicales, les patients consultent pour des problemes benins, tandis que certaines urgences sont parfois sous-estimees.  
Ce projet construit un systeme d'assistance IA en sante pour:

- aider le patient a decrire ses symptomes
- estimer un niveau de preoccupation (GREEN / ORANGE / RED)
- proposer des actions prudentes
- assister le medecin dans l'analyse
- ameliorer la communication medecin-patient

Le systeme ne remplace pas le medecin. Il sert d'aide a l'orientation et a la comprehension.

## 2. Objectif principal

Construire une application capable de:

- analyser les symptomes textes (et maintenant images jointes)
- classer le niveau d'urgence
- proposer des conseils simples
- orienter vers un specialiste et des medecins proches
- fournir au medecin une analyse synthese
- produire une explication claire et validee pour le patient

## 3. Architecture generale

### 3.1 Agent IA Patient

- interaction conversationnelle avec le patient
- triage prudent
- recommandations actionnables
- persona d'assistant (Docteur, Infirmier, Hibou, Chien de secours)
- support des images jointes pour enrichir le contexte IA

### 3.2 Agent IA Medecin

- analyse clinique assistee
- hypotheses prudentes et points de vigilance
- generation d'un draft de rapport patient
- le medecin garde la decision finale

### 3.3 Backend orchestrateur

- auth/roles et securite
- persistance Prisma + SQLite
- orchestration LLM + triage par regles
- OTP de liaison medecin-patient
- workflow de validation du rapport avant exposition patient

## 4. Fonctionnalites principales

### 4.1 Analyse symptomes (texte + image)

Le message peut contenir:

- texte libre
- localisation
- jusqu'a 3 images (data URL)

Les images sont transmises au LLM dans le contexte (mode live) pour aider l'assistance.

### 4.2 Triage medical

- GREEN: surveillance et conseils
- ORANGE: consultation rapide recommandee
- RED: urgence immediate recommandee

### 4.3 Chibi patient (images reelles)

- le patient voit une carte chibi avec image reelle (pas emoji)
- etat visuel adapte a la gravite:
  - GREEN: calme/meditation
  - ORANGE: vigilance
  - RED: alerte
- couleurs renforcees pour une meilleure lisibilite

### 4.4 OTP medecin-patient

Flux:

1. medecin entre patientId
2. demande OTP
3. patient recoit OTP par email
4. medecin confirme OTP
5. lien ACTIVE autorise l'analyse medecin

### 4.5 Workflow rapport valide

1. l'analyse medecin cree un rapport `DRAFT`
2. le medecin valide (`approve`)
3. le backend genere un texte patient-friendly
4. email patient (best effort)
5. le patient voit le rapport valide dans la bulle/chibi

### 4.6 Confidentialite patient

- le patient ne peut pas lire l'historique longitudinal interne via `/patients/:id/history`
- la memoire medicale persistante est interne a l'IA

## 5. Technologies

### Backend

- Node.js
- Express.js
- Prisma
- SQLite
- Zod
- JWT
- Nodemailer

### Frontend

- React (Vite)
- CSS custom

### IA

- triage par regles (deterministe)
- LLM (OpenRouter/Groq)
- contexte multimodal (texte + images) en mode live

## 6. Implementation (etat fusionne)

### Deja implemente

- auth complete (patient/medecin/superadmin)
- triage regle + assistant conversationnel
- memoire medicale persistante patient
- persona assistant patient
- chibi image reel + etats visuels
- OTP liaison medecin-patient
- rapport draft + validation medecin + exposition patient
- support images vers IA (patient et medecin)

### Reste a renforcer

- edition fine du draft medecin avant validation
- accuse reception patient (lu/acquitte)
- audit securite OTP et journalisation detaillee
- tests E2E et tests de non-regression

## 7. Limites

- prototype academique, non certifie medicalement
- ne remplace pas un diagnostic clinique
- qualite depend du LLM et des donnees saisies
- contraintes reglementaires de donnees de sante a traiter pour une version production

## 8. Conclusion

Le projet fusionne maintenant:

- assistance patient empathique
- assistant medecin avec controle final
- securisation par OTP
- diffusion controlee des rapports
- appui multimodal via images

L'architecture reste modulaire pour evoluer vers un produit plus robuste.
