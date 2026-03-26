# Architecture Notes

## Goals
- Keep modules small and focused.
- Add explicit function-level comments.
- Make debugging easier by isolating responsibilities.

## Repository Map
- backend/src
  - app.js: Express app wiring.
  - server.js: entrypoint + seed.
  - config/: runtime configuration.
  - db/: Prisma client.
  - middleware/: auth + rate limits.
  - routes/: HTTP routes (split by domain).
  - services/: LLM, conversation, admin, email, search.
  - utils/: shared pure helpers.
- frontend/src
  - App.jsx: minimal shell.
  - app/: hooks + layout routing.
  - areas/: Patient/Doctor/Admin UI areas.
  - components/: shared UI components.
  - lib/: API + session + utilities.
  - styles/: split CSS bundles.
- docs/: functional and architecture notes.

## Debugging Guide
- Backend startup: backend/src/server.js
- Route wiring: backend/src/app.js
- Chat flow: backend/src/routes/chat/
- Auth flow: backend/src/routes/auth.js
- UI entry: frontend/src/main.jsx
- Session logic: frontend/src/app/useAuthFlow.js
