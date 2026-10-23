const Device = require("../models/Device");
const DeviceProfile = require("../models/DeviceProfile");
const DeviceEvent = require("../models/DeviceEvent");
const Telemetry = require("../models/Telemetry");
const FirmwareJob = require("../models/FirmwareJob");
const Service = require("../models/Service");
const PonPort = require("../models/PonPort");
const trends = require("./trends");
const health = require("./deviceHealth");
const { diagnose } = require("./rootCause");
const { thresholds } = require("./thresholds");
const { reconcile } = require("./alertSync");
const { portLabel } = require("./topology");

const H = 3600 * 1000;
const INTERVAL = () => Number(process.env.INTEL_INTERVAL_SEC || 300) * 1000;
const status = { lastRunAt: null, durationMs: null, devices: 0, alerts: 0, ponOutages: 0, error: null };
const keyOf = (m, p) => `${m}\u0000${p}`;
const LIVE_SERVICE = { device: { $ne: null }, ponPort: { $ne: null }, status: { $ne: "terminated" } };

async function portStats(portIds, stateOf) {
  const services = await Service.find({ ...LIVE_SERVICE, ...(portIds && { ponPort: { $in: portIds } }) }, "device ponPort").lean();
  const missing = services.map(s => String(s.device)).filter(id => !stateOf.has(id));
  if (missing.length) for (const d of await Device.find({ _id: { $in: missing } }, "online offlineSince removedAt").lean()) stateOf.set(String(d._id), d);
  const ports = await PonPort.find({ _id: { $in: [...new Set(services.map(s => String(s.ponPort)))] } }).populate("olt", "name").lean();
  const byId = new Map(ports.map(p => [String(p._id), { ponPort: p._id, olt: p.olt?._id, label: portLabel(p, p.olt), total: 0, online: 0, offline: 0, since: null, devices: [] }]));
  for (const s of services) {
    const port = byId.get(String(s.ponPort));
    const d = stateOf.get(String(s.device));
    if (!port || !d || d.removedAt) continue;
    port.total++;
    port.devices.push(String(s.device));
    if (d.online === true) port.online++;
    if (d.online === false) {
      port.offline++;
      if (d.offlineSince && (!port.since || d.offlineSince < port.since)) port.since = d.offlineSince;
    }
  }
  for (const p of byId.values()) p.outage = !!trends.ponOutage(p);
  return byId;
}

async function gather(now = new Date(), ids = null) {
  const since24 = new Date(now - 24 * H), since1 = new Date(now - H);
  const dev = ids ? { device: { $in: ids } } : {};
  const [devices, profiles, rx, fec, ev, fwEvents] = await Promise.all([
    Device.find(ids ? { _id: { $in: ids } } : { removedAt: null }, "manufacturer productClass online offlineSince mon service").lean(),
    DeviceProfile.find({ verifiedOnRealDevice: true }, "manufacturer productClass").lean(),
    Telemetry.aggregate([
      { $match: { ...dev, at: { $gte: new Date(now - 26 * H) }, rx: { $ne: null } } },
      { $group: {
        _id: "$device",
        old: { $avg: { $cond: [{ $lt: ["$at", new Date(now - 22 * H)] }, "$rx", null] } },
        cur: { $avg: { $cond: [{ $gte: ["$at", new Date(now - 2 * H)] }, "$rx", null] } }
      } }
    ]),
    Telemetry.aggregate([
      { $match: { ...dev, at: { $gte: since1 }, fec: { $ne: null } } },
      { $sort: { at: 1 } },
      { $group: { _id: "$device", first: { $first: "$fec" }, last: { $last: "$fec" } } }
    ]),
    DeviceEvent.aggregate([
      { $match: { ...dev, at: { $gte: since24 }, type: { $in: ["boot", "ppp_reconnect", "wan_down"] } } },
      { $group: {
        _id: { d: "$device", t: "$type" },
        n24: { $sum: { $cond: [{ $eq: ["$details.cause", "acs_reboot"] }, 0, 1] } },
        n1: { $sum: { $cond: [{ $gte: ["$at", since1] }, 1, 0] } }
      } }
    ]),
    DeviceEvent.find({ ...dev, type: "firmware_change", at: { $gte: since24 } }, "device details at").sort({ at: 1 }).lean()
  ]);
  const fwDevices = [...new Set(fwEvents.map(e => String(e.device)))];
  const viaAcs = new Set(fwDevices.length
    ? (await FirmwareJob.find({ device: { $in: fwDevices }, updatedAt: { $gte: new Date(now - 26 * H) }, state: { $in: ["downloading", "rebooting", "applied", "failed"] } }, "device").lean()).map(j => String(j.device))
    : []);

  const verified = new Set(profiles.map(p => keyOf(p.manufacturer, p.productClass)));
  const rxBy = new Map(rx.map(r => [String(r._id), trends.rxDrop(r.old, r.cur)]));
  const fecBy = new Map(fec.map(f => [String(f._id), trends.counterDelta(f.first, f.last)]));
  const evBy = new Map();
  for (const e of ev) evBy.set(`${e._id.d}:${e._id.t}`, e);
  const fwBy = new Map(fwEvents.filter(e => !viaAcs.has(String(e.device))).map(e => [String(e.device), e.details]));

  const stateOf = new Map(devices.map(d => [String(d._id), d]));
  const ownPorts = ids ? (await Service.find({ ...LIVE_SERVICE, device: { $in: ids } }, "ponPort").lean()).map(s => s.ponPort) : null;
  const ports = await portStats(ownPorts, stateOf);
  const portOf = new Map();
  for (const p of ports.values()) for (const d of p.devices) portOf.set(d, p);

  const inputs = devices.map(d => {
    const id = String(d._id);
    const e = t => evBy.get(`${id}:${t}`) || {};
    const pon = portOf.get(id);
    return {
      device: d._id,
      online: d.online ?? null,
      offlineMin: d.online === false && d.offlineSince ? Math.round((now - new Date(d.offlineSince)) / 60000) : null,
      verified: verified.has(keyOf(d.manufacturer, d.productClass)),
      mon: d.mon || {},
      rxDrop: rxBy.get(id) ?? null,
      fecHour: fecBy.get(id) ?? null,
      boots24: e("boot").n24 || 0,
      ppp24: e("ppp_reconnect").n24 || 0,
      ppp1h: e("ppp_reconnect").n1 || 0,
      wanDown24: e("wan_down").n24 || 0,
      wanDown1h: e("wan_down").n1 || 0,
      unexpectedFirmware: fwBy.get(id) || null,
      pon: pon ? { ponPort: pon.ponPort, label: pon.label, total: pon.total, online: pon.online, offline: pon.offline, outage: pon.outage } : null
    };
  });
  return { inputs, ports };
}

let lastRun = 0;
async function intelTick(now = new Date(), { force = false } = {}) {
  if (!force && now - lastRun < INTERVAL() - 5000) return { skipped: true };
  lastRun = +now;
  const started = Date.now();
  try {
    const th = thresholds();
    const { inputs, ports } = await gather(now);
    const desired = inputs.flatMap(x => trends.deviceAlerts(x, th).map(a => ({ device: x.device, ...a })));
    const outages = [...ports.values()].map(p => trends.ponOutage(p, th)).filter(Boolean);
    await reconcile(desired, trends.INTEL_DEVICE_TYPES, now);
    await reconcile(outages, ["pon_outage"], now);
    const ops = inputs.map(x => {
      const h = health.score(x, th);
      return { updateOne: { filter: { _id: x.device }, update: h ? { $set: { health: { ...h, at: now } } } : { $unset: { health: "" } } } };
    });
    for (let i = 0; i < ops.length; i += 1000) await Device.bulkWrite(ops.slice(i, i + 1000), { ordered: false });
    Object.assign(status, { lastRunAt: now, durationMs: Date.now() - started, devices: inputs.length, alerts: desired.length, ponOutages: outages.length, error: null });
  } catch (err) {
    Object.assign(status, { lastRunAt: now, durationMs: Date.now() - started, error: err.message });
    console.error("intel:", err.message);
  }
  return status;
}

async function forDevice(id, now = new Date()) {
  const { inputs } = await gather(now, [id]);
  const x = inputs[0];
  if (!x) return null;
  const th = thresholds();
  return { health: health.score(x, th), causes: diagnose(x, th), pon: x.pon, signals: { rxDrop: x.rxDrop, fecHour: x.fecHour, boots24: x.boots24, ppp24: x.ppp24, ppp1h: x.ppp1h, wanDown24: x.wanDown24 } };
}

module.exports = { tick: intelTick, gather, portStats, forDevice, status };
