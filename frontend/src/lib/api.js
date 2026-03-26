const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:3001";

export async function api(path, { method = "GET", payload, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Erreur API");
  }
  return data;
}

export async function apiStreamChatMessage(conversationId, { payload, token, onEvent }) {
  const headers = { "Content-Type": "application/json", Accept: "text/event-stream" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(
    `${API_BASE_URL}/chat/conversations/${conversationId}/messages?stream=1`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload || {}),
    }
  );

  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Erreur API");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const raw = trimmed.slice(5).trim();
        if (!raw) continue;
        try {
          const evt = JSON.parse(raw);
          if (typeof onEvent === "function") onEvent(evt);
        } catch (_e) {
          // ignore
        }
      }
    }
  }
}
