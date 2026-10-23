const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { isValidObjectId } = require("mongoose");
const User = require("../models/User");
const LoginEvent = require("../models/LoginEvent");
const { requireAuth, requirePerm } = require("../middleware/auth");

const ROLES = User.schema.path("role").enumValues;
const PUBLIC = "name email role isActive lastLoginAt createdAt failedLogins lockedUntil mfa.enabledAt";
const bad = (res, error) => res.status(400).json({ error });
const validPassword = p => typeof p === "string" && p.length >= 12 && p.length <= 128;

router.use(requireAuth, requirePerm("user.manage"));

const event = (req, userId, reason) => LoginEvent.create({ user: userId, ip: req.ip, ok: true, reason, ua: `by ${req.user.email}` }).catch(() => {});

router.get("/", async (req, res) => res.json(await User.find({}, PUBLIC).sort({ createdAt: 1 }).lean()));

router.get("/logins", async (req, res) => {
  const filter = {};
  if (req.query.user) {
    if (!isValidObjectId(req.query.user)) return bad(res, "Invalid user id");
    filter.user = req.query.user;
  }
  if (req.query.failed === "1") filter.ok = false;
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  res.json(await LoginEvent.find(filter).sort({ at: -1 }).limit(limit).populate("user", "name email").lean());
});

router.post("/:id/revoke", async (req, res) => {
  if (!isValidObjectId(req.params.id)) return bad(res, "Invalid user id");
  const user = await User.findByIdAndUpdate(req.params.id, { $inc: { tokenVersion: 1 } }, { new: true, projection: PUBLIC }).lean();
  if (!user) return res.status(404).json({ error: "User not found" });
  event(req, user._id, "revoked");
  res.json(user);
});

router.post("/", async (req, res) => {
  const { name, email, password, role = "agent" } = req.body || {};
  if (typeof name !== "string" || !name.trim()) return bad(res, "Name required");
  if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) return bad(res, "Valid email required");
  if (!validPassword(password)) return bad(res, "Password must be 12-128 characters");
  if (!ROLES.includes(role)) return bad(res, "Invalid role");
  const normalized = email.toLowerCase().trim();
  if (await User.exists({ email: normalized })) return res.status(409).json({ error: "Email already exists" });
  const user = await User.create({ name: name.trim(), email: normalized, role, passwordHash: await bcrypt.hash(password, 12) });
  res.status(201).json(await User.findById(user._id, PUBLIC).lean());
});

router.patch("/:id", async (req, res) => {
  if (!isValidObjectId(req.params.id)) return bad(res, "Invalid user id");
  const { name, role, isActive, password, unlock, resetMfa } = req.body || {};
  const self = req.params.id === req.user.id;
  const $set = {};
  const $unset = {};
  let revoke = false;
  const events = [];
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) return bad(res, "Name required");
    $set.name = name.trim();
  }
  if (role !== undefined) {
    if (!ROLES.includes(role)) return bad(res, "Invalid role");
    if (self && role !== "admin") return bad(res, "You cannot remove your own admin role");
    $set.role = role;
    revoke = true;
  }
  if (isActive !== undefined) {
    if (typeof isActive !== "boolean") return bad(res, "isActive must be boolean");
    if (self && !isActive) return bad(res, "You cannot disable yourself");
    $set.isActive = isActive;
    if (!isActive) revoke = true;
  }
  if (password !== undefined) {
    if (!validPassword(password)) return bad(res, "Password must be 12-128 characters");
    $set.passwordHash = await bcrypt.hash(password, 12);
    revoke = true;
    events.push("password_changed");
  }
  if (unlock === true || password !== undefined) {
    $set.failedLogins = 0;
    $unset.lockedUntil = 1;
    if (unlock === true) events.push("unlocked");
  }
  if (resetMfa === true) {
    $unset.mfa = 1;
    revoke = true;
    events.push("mfa_reset");
  }
  const update = { $set, ...(Object.keys($unset).length && { $unset }), ...(revoke && { $inc: { tokenVersion: 1 } }) };
  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true, projection: PUBLIC }).lean();
  if (!user) return res.status(404).json({ error: "User not found" });
  events.forEach(r => event(req, user._id, r));
  res.json(user);
});

module.exports = router;
