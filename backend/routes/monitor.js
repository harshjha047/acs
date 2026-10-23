const router = require("express").Router();
const { isValidObjectId } = require("mongoose");
const Alert = require("../models/Alert");
const Device = require("../models/Device");
const DeviceEvent = require("../models/DeviceEvent");
const { requireAuth, requireRole } = require("../middleware/auth");
const { clusters } = require("../lib/telemetry");
const monitor = require("../lib/monitor");

const DEVICE_FIELDS = "serialNumber manufacturer productClass pppoeUsername customer lastInformAt offlineSince rxPower rxGrade";
const withDevice = { path: "device", select: DEVICE_FIELDS, populate: { path: "customer", select: "name accountId phone" } };

router.get("/alerts", requireAuth, async (req, res) => {
  const filter = req.query.open === "0" ? {} : { open: true };
  if (req.query.type) filter.type = String(req.query.type);
  if (req.query.device && isValidObjectId(req.query.device)) filter.device = req.query.device;
  const alerts = await Alert.find(filter).sort({ open: -1, openedAt: -1 }).limit(500).populate(withDevice).populate("ackBy", "name").lean();
  res.json(alerts);
});

router.post("/alerts/:alertId/ack", requireAuth, requireRole("noc", "admin"), async (req, res) => {
  if (!isValidObjectId(req.params.alertId)) return res.status(400).json({ error: "Invalid alert id" });
  const alert = await Alert.findById(req.params.alertId);
  if (!alert) return res.status(404).json({ error: "Alert not found" });
  Object.assign(alert, { ackBy: req.user.id, ackAt: new Date(), ackNote: String(req.body?.note || "").trim().slice(0, 500) || undefined });
  if (alert.type === "unknown_device") Object.assign(alert, { open: false, closedAt: new Date() });
  await alert.save();
  res.json(alert);
});

router.get("/outage", requireAuth, async (req, res) => {
  const base = { removedAt: null };
  const [total, online, offline, lowRx, severities, offlineList, events] = await Promise.all([
    Device.countDocuments(base),
    Device.countDocuments({ ...base, online: true }),
    Device.countDocuments({ ...base, online: false }),
    Device.countDocuments({ ...base, online: true, rxGrade: "bad" }),
    Alert.aggregate([{ $match: { open: true } }, { $group: { _id: "$severity", n: { $sum: 1 } } }]),
    Device.find({ ...base, online: false }, DEVICE_FIELDS).populate("customer", "name accountId phone").sort({ offlineSince: -1 }).limit(1000).lean(),
    DeviceEvent.find({ type: { $in: ["boot", "offline", "online", "wan_down", "ppp_reconnect", "firmware_change", "registered"] } })
      .sort({ at: -1 }).limit(100).populate("device", "serialNumber productClass pppoeUsername").lean()
  ]);
  res.json({
    totals: { devices: total, online, offline, unknown: total - online - offline, lowRx, alerts: Object.fromEntries(severities.map(s => [s._id, s.n])) },
    clusters: clusters(offlineList),
    offline: offlineList,
    events,
    monitor: monitor.status
  });
});

router.get("/system/health", requireAuth, requireRole("noc", "admin"), async (req, res) => res.json(await require("../lib/health").report()));

router.post("/monitor/run", requireAuth, requireRole("admin"), async (req, res) => res.json(await monitor.run()));

module.exports = router;
