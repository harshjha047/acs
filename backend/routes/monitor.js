const router = require("express").Router();
const { isValidObjectId } = require("mongoose");
const Alert = require("../models/Alert");
const Device = require("../models/Device");
const DeviceEvent = require("../models/DeviceEvent");
const { requireAuth, requirePerm } = require("../middleware/auth");
const { clusters } = require("../lib/telemetry");
const monitor = require("../lib/monitor");
const intel = require("../lib/intel");
const Service = require("../models/Service");

const withPort = { path: "ponPort", select: "label slot port olt", populate: { path: "olt", select: "name" } };

async function outageDevices(ponOutages) {
  if (!ponOutages.length) return new Map();
  const svc = await Service.find({ ponPort: { $in: ponOutages.map(a => a.ponPort?._id || a.ponPort) }, device: { $ne: null } }, "device ponPort").lean();
  return new Map(svc.map(s => [String(s.device), String(s.ponPort)]));
}

const DEVICE_FIELDS = "serialNumber manufacturer productClass pppoeUsername customer lastInformAt offlineSince rxPower rxGrade";
const withDevice = { path: "device", select: DEVICE_FIELDS, populate: { path: "customer", select: "name accountId phone" } };

router.get("/alerts", requireAuth, async (req, res) => {
  const filter = req.query.open === "0" ? {} : { open: true };
  if (req.query.type) filter.type = String(req.query.type);
  if (req.query.device && isValidObjectId(req.query.device)) filter.device = req.query.device;
  const alerts = await Alert.find(filter).sort({ open: -1, openedAt: -1 }).limit(500).populate(withDevice).populate(withPort).populate("ackBy", "name").lean();
  const inOutage = await outageDevices(alerts.filter(a => a.open && a.type === "pon_outage"));
  res.json(alerts.map(a => (a.type === "offline" && a.device && inOutage.has(String(a.device._id)) ? { ...a, inOutage: inOutage.get(String(a.device._id)) } : a)));
});

router.post("/alerts/:alertId/ack", requireAuth, requirePerm("alert.ack"), async (req, res) => {
  if (!isValidObjectId(req.params.alertId)) return res.status(400).json({ error: "Invalid alert id" });
  const alert = await Alert.findById(req.params.alertId);
  if (!alert) return res.status(404).json({ error: "Alert not found" });
  Object.assign(alert, { ackBy: req.user.id, ackAt: new Date(), ackNote: String(req.body?.note || "").trim().slice(0, 500) || undefined });
  if (alert.type === "unknown_device") Object.assign(alert, { open: false, closedAt: new Date() });
  await alert.save();
  res.json(alert);
});

async function fleet() {
  const base = { removedAt: null };
  const [total, online, offline, lowRx, severities, offlineList, ponOutages] = await Promise.all([
    Device.countDocuments(base),
    Device.countDocuments({ ...base, online: true }),
    Device.countDocuments({ ...base, online: false }),
    Device.countDocuments({ ...base, online: true, rxGrade: "bad" }),
    Alert.aggregate([{ $match: { open: true } }, { $group: { _id: "$severity", n: { $sum: 1 } } }]),
    Device.find({ ...base, online: false }, DEVICE_FIELDS).populate("customer", "name accountId phone").sort({ offlineSince: -1 }).limit(1000).lean(),
    Alert.find({ open: true, type: "pon_outage" }).sort({ affected: -1 }).populate(withPort).lean()
  ]);
  const inOutage = await outageDevices(ponOutages);
  return {
    totals: { devices: total, online, offline, unknown: total - online - offline, lowRx, alerts: Object.fromEntries(severities.map(s => [s._id, s.n])) },
    ponOutages,
    clusters: clusters(offlineList.filter(d => !inOutage.has(String(d._id)))),
    offline: offlineList.map(d => (inOutage.has(String(d._id)) ? { ...d, inOutage: inOutage.get(String(d._id)) } : d))
  };
}

router.get("/outage", requireAuth, async (req, res) => {
  const [f, events] = await Promise.all([
    fleet(),
    DeviceEvent.find({ type: { $in: ["boot", "offline", "online", "wan_down", "ppp_reconnect", "firmware_change", "registered"] } })
      .sort({ at: -1 }).limit(100).populate("device", "serialNumber productClass pppoeUsername").lean()
  ]);
  res.json({ ...f, events, monitor: monitor.status, intel: intel.status });
});

router.get("/noc", requireAuth, async (req, res) => {
  const [f, healthAgg, byType, critical, ports] = await Promise.all([
    fleet(),
    Device.aggregate([
      { $match: { removedAt: null, "health.status": { $exists: true } } },
      { $group: { _id: "$health.status", n: { $sum: 1 }, sum: { $sum: "$health.score" } } }
    ]),
    Alert.aggregate([{ $match: { open: true } }, { $group: { _id: { type: "$type", severity: "$severity" }, n: { $sum: 1 } } }]),
    Alert.find({ open: true, severity: "critical", type: { $ne: "pon_outage" } }).sort({ openedAt: -1 }).limit(15).populate(withDevice).lean(),
    intel.portStats(null, new Map())
  ]);
  const scored = healthAgg.reduce((n, h) => n + h.n, 0);
  const sum = healthAgg.reduce((n, h) => n + h.sum, 0);
  const { online, offline } = f.totals;
  res.json({
    totals: f.totals,
    networkHealthPct: scored ? Math.round(sum / scored) : null,
    availabilityPct: online + offline ? Math.round((online / (online + offline)) * 1000) / 10 : null,
    health: Object.fromEntries(healthAgg.map(h => [h._id, h.n])),
    alertsByType: byType.map(b => ({ ...b._id, n: b.n })),
    ponOutages: f.ponOutages,
    clusters: f.clusters,
    worstPorts: [...ports.values()].filter(p => p.offline).sort((a, b) => b.offline / b.total - a.offline / a.total || b.offline - a.offline).slice(0, 8)
      .map(({ devices: _, ...p }) => p),
    critical,
    monitor: monitor.status,
    intel: intel.status
  });
});

router.get("/system/health", requireAuth, requirePerm("system.view"), async (req, res) => res.json(await require("../lib/health").report()));

router.post("/monitor/run", requireAuth, requirePerm("monitor.run"), async (req, res) => {
  const m = await monitor.run();
  res.json({ ...m, intel: await intel.tick(new Date(), { force: true }) });
});

module.exports = router;
