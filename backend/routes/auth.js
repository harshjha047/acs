const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const LoginEvent = require("../models/LoginEvent");
const totp = require("../lib/totp");
const box = require("../lib/secretBox");
const guard = require("../lib/loginGuard");
const { permsFor, mfaRequired } = require("../lib/permissions");
const { requireAuth, requireAuthAllowMfaSetup } = require("../middleware/auth");

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many attempts. Try again in a few minutes." } });
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 12);
const ISSUER = process.env.MFA_ISSUER || "DIV ACS";
const validPassword = p => typeof p === "string" && p.length >= 12 && p.length <= 128;

const record = (req, user, ok, reason, email) =>
  LoginEvent.create({ user: user?._id, email: email ?? user?.email, ip: req.ip, ua: String(req.get("user-agent") || "").slice(0, 200), ok, reason }).catch(() => {});

const sign = user => jwt.sign({ id: user._id, role: user.role, email: user.email, tv: user.tokenVersion || 0 }, process.env.JWT_SECRET, { expiresIn: "8h" });

const profile = user => ({
  id: user._id, name: user.name, email: user.email, role: user.role,
  permissions: permsFor(user.role),
  mfa: { enabled: !!user.mfa?.enabledAt, required: mfaRequired(user.role) }
});

async function success(req, res, user, reason) {
  await User.updateOne({ _id: user._id }, { $set: { failedLogins: 0, lastLoginAt: new Date() }, $unset: { lockedUntil: 1 } });
  record(req, user, true, reason);
  res.json({ token: sign(user), user: profile(user) });
}

async function failure(req, res, user, reason) {
  await User.updateOne({ _id: user._id }, { $set: guard.failureUpdate(user.failedLogins) });
  record(req, user, false, reason);
  res.status(401).json({ error: reason === "bad_mfa" ? "Invalid code" : "Invalid credentials" });
}

function locked(req, res, user) {
  const min = guard.lockedFor(user);
  if (!min) return false;
  record(req, user, false, "locked");
  res.status(429).json({ error: `Too many failed attempts. Try again in ${min} min.` });
  return true;
}

router.post("/login", limiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string") return res.status(400).json({ error: "Email and password required" });
  const normalized = email.toLowerCase().trim().slice(0, 200);
  const user = await User.findOne({ email: normalized });
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    record(req, null, false, "unknown_user", normalized);
    return res.status(401).json({ error: "Invalid credentials" });
  }
  if (locked(req, res, user)) return;
  if (!(await bcrypt.compare(password, user.passwordHash))) return failure(req, res, user, "bad_password");
  if (!user.isActive) {
    record(req, user, false, "disabled");
    return res.status(401).json({ error: "Invalid credentials" });
  }
  if (user.mfa?.enabledAt) {
    record(req, user, false, "mfa_pending");
    const mfaToken = jwt.sign({ id: user._id, purpose: "mfa", tv: user.tokenVersion || 0 }, process.env.JWT_SECRET, { expiresIn: "5m" });
    return res.json({ mfaRequired: true, mfaToken });
  }
  success(req, res, user, "ok");
});

router.post("/mfa/verify", limiter, async (req, res) => {
  const { mfaToken, code } = req.body || {};
  let claims;
  try {
    claims = jwt.verify(String(mfaToken || ""), process.env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    return res.status(401).json({ error: "Sign-in expired. Start again.", restart: true });
  }
  if (claims.purpose !== "mfa") return res.status(401).json({ error: "Invalid token", restart: true });
  const user = await User.findById(claims.id).select("+mfa.secret +mfa.lastStep");
  if (!user?.isActive || !user.mfa?.secret || (claims.tv ?? 0) !== (user.tokenVersion || 0)) return res.status(401).json({ error: "Sign-in expired. Start again.", restart: true });
  if (locked(req, res, user)) return;
  const step = totp.verify(box.open(user.mfa.secret), code, { lastStep: user.mfa.lastStep ?? -1 });
  if (step === null) return failure(req, res, user, "bad_mfa");
  const { modifiedCount } = await User.updateOne(
    { _id: user._id, $or: [{ "mfa.lastStep": { $exists: false } }, { "mfa.lastStep": { $lt: step } }] },
    { $set: { "mfa.lastStep": step } }
  );
  if (!modifiedCount) return failure(req, res, user, "bad_mfa");
  success(req, res, user, "mfa_ok");
});

router.get("/me", requireAuthAllowMfaSetup, async (req, res) => res.json(profile(await User.findById(req.user.id).lean())));

router.post("/mfa/setup", requireAuthAllowMfaSetup, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (user.mfa?.enabledAt) return res.status(409).json({ error: "Two-factor sign-in is already on" });
  const secret = totp.generateSecret();
  await User.updateOne({ _id: user._id }, { $set: { "mfa.pending": box.seal(secret) } });
  res.json({ secret, uri: totp.otpauthUri(secret, user.email, ISSUER) });
});

router.post("/mfa/enable", requireAuthAllowMfaSetup, async (req, res) => {
  const user = await User.findById(req.user.id).select("+mfa.pending");
  if (user.mfa?.enabledAt) return res.status(409).json({ error: "Two-factor sign-in is already on" });
  if (!user.mfa?.pending) return res.status(400).json({ error: "Start setup first" });
  const secret = box.open(user.mfa.pending);
  const step = totp.verify(secret, req.body?.code);
  if (step === null) return res.status(400).json({ error: "Code didn't match. Check the phone's clock and try the next code." });
  await User.updateOne({ _id: user._id }, { $set: { "mfa.secret": user.mfa.pending, "mfa.lastStep": step, "mfa.enabledAt": new Date() }, $unset: { "mfa.pending": 1 } });
  record(req, user, true, "mfa_enabled");
  res.json(profile(await User.findById(user._id).lean()));
});

router.post("/mfa/disable", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).select("+mfa.secret +passwordHash");
  if (mfaRequired(user.role)) return res.status(403).json({ error: "Two-factor sign-in is required for your role" });
  if (!user.mfa?.secret) return res.status(400).json({ error: "Two-factor sign-in is off" });
  if (!(await bcrypt.compare(String(req.body?.password || ""), user.passwordHash))) return res.status(400).json({ error: "Wrong password" });
  if (totp.verify(box.open(user.mfa.secret), req.body?.code) === null) return res.status(400).json({ error: "Invalid code" });
  await User.updateOne({ _id: user._id }, { $unset: { mfa: 1 } });
  record(req, user, true, "mfa_disabled");
  res.json(profile(await User.findById(user._id).lean()));
});

router.post("/password", requireAuthAllowMfaSetup, async (req, res) => {
  const { current, next } = req.body || {};
  if (!validPassword(next)) return res.status(400).json({ error: "New password must be 12-128 characters" });
  const user = await User.findById(req.user.id);
  if (!(await bcrypt.compare(String(current || ""), user.passwordHash))) return res.status(400).json({ error: "Current password is wrong" });
  const updated = await User.findByIdAndUpdate(user._id, { $set: { passwordHash: await bcrypt.hash(next, 12) }, $inc: { tokenVersion: 1 } }, { new: true });
  record(req, user, true, "password_changed");
  res.json({ token: sign(updated), user: profile(updated) });
});

router.post("/logout-all", requireAuthAllowMfaSetup, async (req, res) => {
  await User.updateOne({ _id: req.user.id }, { $inc: { tokenVersion: 1 } });
  record(req, { _id: req.user.id, email: req.user.email }, true, "logout_all");
  res.status(204).end();
});

module.exports = router;
