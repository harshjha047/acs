const router = require("express").Router();
const { isValidObjectId } = require("mongoose");
const Customer = require("../models/Customer");
const Device = require("../models/Device");
const PreRegistration = require("../models/PreRegistration");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth);

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const FIELDS = ["name", "phone", "email", "accountId", "address", "connectionDate"];
const pick = body => Object.fromEntries(FIELDS.filter(f => body?.[f] !== undefined).map(f => [f, body[f]]));

router.get("/", async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 100);
  const re = new RegExp(escapeRe(q), "i");
  const filter = q ? { $or: [{ name: re }, { phone: re }, { accountId: re }, { email: re }] } : {};
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
  const customers = await Customer.find(filter).sort({ updatedAt: -1 }).limit(limit).lean();
  const counts = await Device.aggregate([
    { $match: { customer: { $in: customers.map(c => c._id) }, removedAt: null } },
    { $group: { _id: "$customer", devices: { $sum: 1 }, online: { $sum: { $cond: ["$online", 1, 0] } } } }
  ]);
  const byId = new Map(counts.map(c => [String(c._id), c]));
  res.json(customers.map(c => ({ ...c, devices: byId.get(String(c._id))?.devices || 0, online: byId.get(String(c._id))?.online || 0 })));
});

router.post("/", async (req, res) => {
  const data = pick(req.body);
  if (!data.name || !data.accountId) return res.status(400).json({ error: "Name and account ID are required" });
  try {
    res.status(201).json(await Customer.create(data));
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "Account ID already exists" });
    throw err;
  }
});

router.get("/:id", async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
  const customer = await Customer.findById(req.params.id).lean();
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  const [devices, preRegistrations] = await Promise.all([
    Device.find({ customer: customer._id, removedAt: null }, "-mon").sort({ lastInformAt: -1 }).lean(),
    PreRegistration.find({ customer: customer._id }).sort({ createdAt: -1 }).limit(50).populate("template", "name").lean()
  ]);
  res.json({ ...customer, devices, preRegistrations });
});

router.patch("/:id", async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
  const customer = await Customer.findByIdAndUpdate(req.params.id, pick(req.body), { new: true, runValidators: true });
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json(customer);
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
  const [devices, waiting] = await Promise.all([
    Device.exists({ customer: req.params.id, removedAt: null }),
    PreRegistration.exists({ customer: req.params.id, status: "waiting" })
  ]);
  if (devices || waiting) return res.status(409).json({ error: "Unlink devices and cancel waiting pre-registrations first" });
  const deleted = await Customer.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Customer not found" });
  res.json({ ok: true });
});

module.exports = router;
