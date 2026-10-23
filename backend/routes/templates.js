const router = require("express").Router();
const { isValidObjectId } = require("mongoose");
const Template = require("../models/ProvisioningTemplate");
const PreRegistration = require("../models/PreRegistration");
const Device = require("../models/Device");
const Customer = require("../models/Customer");
const genie = require("../genieacsClient");
const p = require("../lib/provisioning");
const { requireAuth, requirePerm } = require("../middleware/auth");

router.use(requireAuth);

router.param("id", async (req, res, next, id) => {
  if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });
  req.template = await Template.findById(id);
  if (!req.template) return res.status(404).json({ error: "Template not found" });
  next();
});

router.get("/", async (req, res) => {
  const templates = await Template.find().sort({ isActive: -1, name: 1 }).populate("createdBy", "name").lean();
  const usage = await Device.aggregate([{ $match: { "provisioning.template": { $ne: null } } }, { $group: { _id: { t: "$provisioning.template", s: "$provisioning.state" }, n: { $sum: 1 } } }]);
  const byTpl = {};
  for (const u of usage) (byTpl[u._id.t] ??= {})[u._id.s] = u.n;
  res.json(templates.map(t => ({ ...t, usage: byTpl[t._id] || {} })));
});

const saveErr = err => (err.code === 11000 ? Object.assign(new Error("A template with this name already exists"), { status: 409 }) : err);

router.post("/", requirePerm("template.write"), async (req, res) => {
  const data = p.validateTemplate(req.body);
  p.assertAutoSafe(data);
  if (data.autoApplyToNew) data.armedAt = new Date();
  const tpl = await Template.create({ ...data, createdBy: req.user.id }).catch(err => { throw saveErr(err); });
  res.status(201).json(tpl);
});

router.patch("/:id", requirePerm("template.write"), async (req, res) => {
  const data = p.validateTemplate(req.body, { partial: true });
  const merged = { ...req.template.toObject(), ...data };
  p.assertAutoSafe(merged);
  if (data.autoApplyToNew && !req.template.autoApplyToNew) data.armedAt = new Date();
  if (data.autoApplyToNew === false) data.armedAt = null;
  Object.assign(req.template, data);
  await req.template.save().catch(err => { throw saveErr(err); });
  res.json(req.template);
});

router.delete("/:id", requirePerm("template.write"), async (req, res) => {
  const [pre, busy] = await Promise.all([
    PreRegistration.exists({ template: req.template._id, status: "waiting" }),
    Device.exists({ "provisioning.template": req.template._id, "provisioning.state": { $in: ["pending", "queued"] } })
  ]);
  if (pre || busy) return res.status(409).json({ error: "Template is in use by waiting pre-registrations or running provisioning. Deactivate it instead." });
  await req.template.deleteOne();
  res.json({ ok: true });
});

router.post("/:id/preview", requirePerm("template.preview"), async (req, res) => {
  const { deviceId, ssid, ssid5, password } = req.body || {};
  if (!isValidObjectId(deviceId)) return res.status(400).json({ error: "Pick a device" });
  const device = await Device.findById(deviceId).lean();
  if (!device) return res.status(404).json({ error: "Device not found" });
  const doc = await genie.getDevice(device.genieacsDeviceId);
  if (!doc) return res.status(404).json({ error: "Device not found in GenieACS" });
  const customer = device.customer ? await Customer.findById(device.customer, "accountId phone").lean() : null;
  const overrides = { ssid, ssid5, password: password || (req.template.wifi?.password === "generate" ? "(generated)" : undefined) };
  const { changes, skipped, waiting } = p.plan(doc, req.template.toObject(), { overrides, ctx: { serialNumber: device.serialNumber, macAddress: device.macAddress, customer } });
  res.json({ changes, skipped, waiting });
});

module.exports = router;
