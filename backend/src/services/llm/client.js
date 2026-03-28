const {
  LLM_API_KEY,
  LLM_PROVIDER,
  LLM_BASE_URL,
  LLM_MODEL,
  LLM_APP_NAME,
  LLM_APP_SITE,
} = require("../../config/env");

/**
 * [Module: src/services/llm/client.js]
 * Client bas niveau pour appels LLM.
 */

/**
 * Extrait le texte assistant d'une reponse compatible OpenAI.
 */
function extractAssistantText(chatPayload) {
  const raw = chatPayload?.choices?.[0]?.message?.content;
  if (typeof raw === "string") {
    return raw.trim();
  }
  if (Array.isArray(raw)) {
    return raw
      .map((item) => (typeof item?.text === "string" ? item.text : ""))
      .join("\n")
      .trim();
  }
  return "";
}

/**
 * Appel LLM non streaming.
 */
async function callLLM({
  systemPrompt,
  userPrompt,
  messages,
  temperature = 0.3,
  maxTokens = 500,
  model = LLM_MODEL,
}) {
  if (!LLM_API_KEY) {
    throw new Error(
      "LLM_API_KEY manquant. Configurez une cle OpenRouter ou Groq dans backend/.env."
    );
  }

  const headers = {
    Authorization: `Bearer ${LLM_API_KEY}`,
    "Content-Type": "application/json",
  };

  if (LLM_PROVIDER === "openrouter") {
    headers["HTTP-Referer"] = LLM_APP_SITE;
    headers["X-OpenRouter-Title"] = LLM_APP_NAME;
    headers["X-Title"] = LLM_APP_NAME;
  }

  const response = await fetch(LLM_BASE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages:
        Array.isArray(messages) && messages.length > 0
          ? messages
          : [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Erreur API LLM (${response.status})`);
  }

  const content = extractAssistantText(payload);
  if (!content) {
    throw new Error("Reponse LLM vide");
  }

  return content;
}

/**
 * Appel LLM en streaming (SSE).
 */
async function callLLMStream({
  messages,
  temperature = 0.3,
  maxTokens = 500,
  onDelta,
  model = LLM_MODEL,
}) {
  if (!LLM_API_KEY) {
    throw new Error(
      "LLM_API_KEY manquant. Configurez une cle OpenRouter ou Groq dans backend/.env."
    );
  }

  const headers = {
    Authorization: `Bearer ${LLM_API_KEY}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };

  if (LLM_PROVIDER === "openrouter") {
    headers["HTTP-Referer"] = LLM_APP_SITE;
    headers["X-OpenRouter-Title"] = LLM_APP_NAME;
    headers["X-Title"] = LLM_APP_NAME;
  }

  const response = await fetch(LLM_BASE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error?.message || `Erreur API LLM (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";

  function pushDelta(text) {
    if (!text) return;
    fullText += text;
    if (typeof onDelta === "function") onDelta(text);
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      const lines = chunk.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data) continue;
        if (data === "[DONE]") {
          return fullText;
        }
        try {
          const json = JSON.parse(data);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) {
            pushDelta(delta);
          }
        } catch (_e) {
          // ignore non-JSON data lines
        }
      }
    }
  }

  return fullText;
}

module.exports = {
  extractAssistantText,
  callLLM,
  callLLMStream,
};
