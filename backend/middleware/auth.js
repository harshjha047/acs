const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing token" });
  let claims;
  try {
    claims = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
  const user = await User.findById(claims.id, "role isActive email").lean();
  if (!user?.isActive) return res.status(401).json({ error: "Account disabled" });
  req.user = { id: String(user._id), role: user.role, email: user.email };
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Not allowed for your role" });
    next();
  };
}

module.exports = { requireAuth, requireRole };
