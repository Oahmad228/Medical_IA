const SESSION_KEY = "medical_ai_session_v2";

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.user?.role) return null;
    return parsed;
  } catch (_error) {
    return null;
  }
}

export function persistSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  localStorage.removeItem(SESSION_KEY);
}
