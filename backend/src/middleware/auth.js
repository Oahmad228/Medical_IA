const jwt = require("jsonwebtoken");
const { JWT_SECRET, JWT_EXPIRES_IN } = require("../config/env");

/**
 * [Module: src/middleware/auth.js] issueSession
 * Creates a signed JWT for the given user; used by the login route.
 */
function issueSession(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * [Module: src/middleware/auth.js] authRequired
 * Express middleware that validates JWTs and attaches session data.
 */
function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Token manquant." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.session = {
      id: Number(payload.sub),
      role: payload.role,
      email: payload.email,
      fullName: payload.fullName,
      status: payload.status,
    };
    req.token = token;
    return next();
  } catch (_error) {
    return res.status(401).json({ error: "Token invalide ou expire." });
  }
}

/**
 * [Module: src/middleware/auth.js] requireRole
 * Middleware factory that enforces a single role on a route.
 */
function requireRole(role) {
  return (req, res, next) => {
    if (!req.session || req.session.role !== role) {
      return res.status(403).json({ error: "Acces refuse." });
    }
    return next();
  };
}

module.exports = { issueSession, authRequired, requireRole };
