const router = require("express").Router();
const { isValidObjectId } = require("mongoose");
const PreRegistration = require("../models/PreRegistration");
const Template = require("../models/ProvisioningTemplate");
const Customer = require("../models/Customer");
const provisioner = require("../lib/provisioner");
const p = require("../lib/provisioning");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth);

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const bad = msg => Object.assign(new Error(msg), { status: 400 });

router.param("id", async (req, res, next, id) => {
  if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });
  req.pre = await PreRegistration.findById(id);
  if (!req.pre) return res.status(404).json({ error: "Pre-registration not found" });
  next();
});

router.get("/", async (req, res) => {
  const filter = {};
  if (["waiting", "matched", "cancelled"].includes(req.query.status)) filter.status = req.query.status;
  if (isValidObjectId(req.query.customer)) filter.customer = req.query.customer;
  const q = String(req.query.q || "").trim().slice(0, 100);
  if (q) {
    const re = new RegExp(escapeRe(q), "i");
    const customers = await Customer.find({ $or: [{ name: re }, { accountId: re }, { phone: re }] }, "_id").limit(50).lean();
    filter.$or = [{ serialNumber: re }, { macAddress: re }, { note: re }, { customer: { $in: customers.map(c => c._id) } }];
  }
  const list = await PreRegistration.find(filter).sort({ createdAt: -1 }).limit(300)
    .populate("customer", "name accountId phone").populate("template", "name").populate("createdBy", "name")
    .populate("device", "serialNumber provisioning.state provisioning.error").lean();
  res.json(list);
});

async function resolveCustomer(body) {
  if (body.customerId) {
    if (!isValidObjectId(body.customerId) || !(await Customer.exists({ _id: body.customerId }))) throw bad("Invalid customer");
    return body.customerId;
  }
  const c = body.customer;
  if (!c?.name && !c?.accountId) return null;
  if (!c.name || !c.accountId) throw bad("New customer needs a name and account ID");
  try {
    const created = await Customer.create({ name: c.name, accountId: c.accountId, phone: c.phone, address: c.address });
    return created._id;
  } catch (err) {
    if (err.code === 11000) throw Object.assign(new Error("Account ID already exists; pick the existing customer"), { status: 409 });
    throw err;
  }
}

router.post("/", requireRole("noc", "admin"), async (req, res) => {
  const b = req.body || {};
  const serialNumber = p.normSerial(b.serialNumber);
  const macAddress = p.normMac(b.macAddress);
  if (!serialNumber && !macAddress) throw bad("Enter the serial number or the WAN MAC");
  for (const [k, label] of [["ssid", "SSID"], ["ssid5", "5 GHz SSID"]]) if (b[k] && !p.SSID_RE.test(b[k])) throw bad(`${label} must be 1-32 printable characters`);
  if (b.wifiPassword && !p.PSK_RE.test(b.wifiPassword)) throw bad("Wi-Fi password must be 8-63 printable characters");
  let template = null;
  if (b.templateId) {
    template = await Template.findById(b.templateId).lean();
    if (!template?.isActive) throw bad("Template not found or inactive");
  }
  const dup = await PreRegistration.exists({ status: "waiting", $or: [...(serialNumber ? [{ serialNumber }] : []), ...(macAddress ? [{ macAddress }] : [])] });
  if (dup) return res.status(409).json({ error: "This serial or MAC is already waiting to be matched" });
  const wifiPassword = b.wifiPassword || (template?.wifi?.password === "generate" ? p.generatePassword() : undefined);
  const pre = await PreRegistration.create({
    serialNumber, macAddress, template: template?._id, customer: await resolveCustomer(b),
    ssid: b.ssid || undefined, ssid5: b.ssid5 || undefined, wifiPassword,
    tags: p.normTags(b.tags), note: String(b.note || "").trim().slice(0, 500), createdBy: req.user.id
  });
  provisioner.matchPreRegistrations().catch(err => console.error("provisioner match:", err.message));
  const { wifiPassword: _, ...out } = pre.toObject();
  res.status(201).json({ ...out, wifiPassword: wifiPassword || null });
});

router.post("/:id/cancel", requireRole("noc", "admin"), async (req, res) => {
  if (req.pre.status !== "waiting") return res.status(409).json({ error: `Already ${req.pre.status}` });
  req.pre.status = "cancelled";
  await req.pre.save();
  res.json(req.pre);
});

router.get("/:id/secret", requireRole("noc", "admin"), async (req, res) => {
  const pre = await PreRegistration.findById(req.pre._id).select("+wifiPassword");
  pre.revealed.push({ user: req.user.id, at: new Date() });
  await pre.save();
  res.json({ wifiPassword: pre.wifiPassword || null });
});

module.exports = router;
