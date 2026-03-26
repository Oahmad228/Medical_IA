const { LLM_VISION_MODEL } = require("../config/env");

/**
 * [Module: src/utils/images.js] normalizeIncomingImageInputs
 * Filters and caps incoming image inputs to valid data URLs or HTTP links.
 */
function normalizeIncomingImageInputs(images) {
  if (!Array.isArray(images)) return [];
  return images
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .filter((v) => v.startsWith("data:image/") || /^https?:\/\//i.test(v))
    .slice(0, 3);
}

/**
 * [Module: src/utils/images.js] shouldUseVision
 * Returns true when a vision model is configured and images are present.
 */
function shouldUseVision(imageInputs) {
  if (!LLM_VISION_MODEL) return false;
  return normalizeIncomingImageInputs(imageInputs).length > 0;
}

/**
 * [Module: src/utils/images.js] withVisionUserMessage
 * Adds image URLs to the last user message in OpenAI vision format.
 */
function withVisionUserMessage({ baseMessages, userText, imageInputs }) {
  const images = normalizeIncomingImageInputs(imageInputs);
  if (!images.length) return baseMessages;
  const userContent = [
    { type: "text", text: String(userText || "") },
    ...images.map((url) => ({ type: "image_url", image_url: { url } })),
  ];
  return [...baseMessages, { role: "user", content: userContent }];
}

module.exports = { normalizeIncomingImageInputs, shouldUseVision, withVisionUserMessage };
