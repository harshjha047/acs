const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { PERMS, can, mfaRequired } = require("../lib/permissions");

function authenticate({ allowMfaSetup = false } = {}) {
  return async (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing token" });
    let claims;
    try {
      claims = jwt.verify(header.slice(7), process.env.JWT_SECRET, { algorithms: ["HS256"] });
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
    if (claims.purpose) return res.status(401).json({ error: "Invalid token" });
    const user = await User.findById(claims.id, "role isActive email tokenVersion mfa.enabledAt").lean();
    if (!user?.isActive) return res.status(401).json({ error: "Account disabled" });
    if ((claims.tv ?? 0) !== (user.tokenVersion ?? 0)) return res.status(401).json({ error: "Session expired. Sign in again." });
    req.user = { id: String(user._id), role: user.role, email: user.email, mfa: !!user.mfa?.enabledAt };
    if (!allowMfaSetup && mfaRequired(user.role) && !req.user.mfa) {
      return res.status(403).json({ error: "Set up two-factor sign-in to continue", mfaSetupRequired: true });
    }
    next();
  };
}

const requireAuth = authenticate();
const requireAuthAllowMfaSetup = authenticate({ allowMfaSetup: true });

function requirePerm(perm) {
  if (!PERMS.includes(perm)) throw new Error(`Unknown permission ${perm}`);
  return (req, res, next) => (can(req.user.role, perm) ? next() : res.status(403).json({ error: "Not allowed for your role" }));
}

module.exports = { requireAuth, requireAuthAllowMfaSetup, requirePerm };
