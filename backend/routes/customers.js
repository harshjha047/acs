const router = require("express").Router();
const { isValidObjectId } = require("mongoose");
const Customer = require("../models/Customer");
const Device = require("../models/Device");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const FIELDS = ["name", "phone", "email", "accountId", "address", "connectionDate"];
const pick = body => Object.fromEntries(FIELDS.filter(f => body?.[f] !== undefined).map(f => [f, body[f]]));

router.get("/", async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 100);
  const re = new RegExp(escapeRe(q), "i");
  const filter = q ? { $or: [{ name: re }, { phone: re }, { accountId: re }, { email: re }] } : {};
  res.json(await Customer.find(filter).sort({ updatedAt: -1 }).limit(50).lean());
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
  res.json({ ...customer, devices: await Device.find({ customer: customer._id }).lean() });
});

router.patch("/:id", async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
  const customer = await Customer.findByIdAndUpdate(req.params.id, pick(req.body), { new: true, runValidators: true });
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json(customer);
});

module.exports = router;
