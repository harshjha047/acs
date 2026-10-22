const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { isValidObjectId } = require("mongoose");
const User = require("../models/User");
const { requireAuth, requireRole } = require("../middleware/auth");

const ROLES = User.schema.path("role").enumValues;
const PUBLIC = "name email role isActive lastLoginAt createdAt";
const bad = (res, error) => res.status(400).json({ error });
const validPassword = p => typeof p === "string" && p.length >= 12 && p.length <= 128;

router.use(requireAuth, requireRole("admin"));

router.get("/", async (req, res) => res.json(await User.find({}, PUBLIC).sort({ createdAt: 1 }).lean()));

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
  const { name, role, isActive, password } = req.body || {};
  const self = req.params.id === req.user.id;
  const $set = {};
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) return bad(res, "Name required");
    $set.name = name.trim();
  }
  if (role !== undefined) {
    if (!ROLES.includes(role)) return bad(res, "Invalid role");
    if (self && role !== "admin") return bad(res, "You cannot remove your own admin role");
    $set.role = role;
  }
  if (isActive !== undefined) {
    if (typeof isActive !== "boolean") return bad(res, "isActive must be boolean");
    if (self && !isActive) return bad(res, "You cannot disable yourself");
    $set.isActive = isActive;
  }
  if (password !== undefined) {
    if (!validPassword(password)) return bad(res, "Password must be 12-128 characters");
    $set.passwordHash = await bcrypt.hash(password, 12);
  }
  const user = await User.findByIdAndUpdate(req.params.id, { $set }, { new: true, projection: PUBLIC }).lean();
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

module.exports = router;
