/**
 * [Module: src/utils/normalize.js] normalize
 * Normalizes input text for rule-based matching (lowercase + remove accents).
 */
function normalize(text) {
  return (text || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * [Module: src/utils/normalize.js] hasAnyTerm
 * Returns true if any term exists inside the normalized text.
 */
function hasAnyTerm(text, terms) {
  return terms.some((term) => text.includes(normalize(term)));
}

/**
 * [Module: src/utils/normalize.js] hasAllTermGroups
 * Returns true if every term group has at least one match in the text.
 */
function hasAllTermGroups(text, groups) {
  return groups.every((group) => hasAnyTerm(text, group));
}

/**
 * [Module: src/utils/normalize.js] isGreetingOnly
 * Detects short greeting-only messages to avoid irrelevant triage.
 */
function isGreetingOnly(message) {
  const text = normalize(message).trim();
  if (!text) return false;

  const greetingTokens = [
    "bonjour",
    "bonsoir",
    "salut",
    "hello",
    "salam",
    "coucou",
    "bjr",
  ];

  const cleaned = text.replace(/[!?.,;:]/g, " ").replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ").filter(Boolean);

  return words.length <= 3 && words.every((w) => greetingTokens.includes(w));
}

module.exports = { normalize, hasAnyTerm, hasAllTermGroups, isGreetingOnly };
