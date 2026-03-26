const crypto = require("crypto");

/**
 * [Module: src/utils/crypto.js] hashPassword
 * Hashes a password using sha256 with a random salt.
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return `${salt}:${digest}`;
}

/**
 * [Module: src/utils/crypto.js] verifyPassword
 * Verifies a password against a stored salt:digest hash.
 */
function verifyPassword(storedHash, password) {
  if (!storedHash || !password) return false;
  const [salt, digest] = String(storedHash).split(":");
  if (!salt || !digest) return false;
  const computed = crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(computed));
}

/**
 * [Module: src/utils/crypto.js] sha256
 * Computes a sha256 digest for tokens and OTPs.
 */
function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

/**
 * [Module: src/utils/crypto.js] createRawToken
 * Generates a random hex token for email verification or password resets.
 */
function createRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

module.exports = { hashPassword, verifyPassword, sha256, createRawToken };
