const genie = require("../genieacsClient");
const Device = require("../models/Device");
const DeviceProfile = require("../models/DeviceProfile");
const DeviceEvent = require("../models/DeviceEvent");
const Telemetry = require("../models/Telemetry");
const AuditLog = require("../models/AuditLog");
const Alert = require("../models/Alert");
const t = require("./telemetry");

const PAGE = 500;
const INTERVAL = () => Number(process.env.MONITOR_INTERVAL_SEC || 60) * 1000;
const SAMPLE_MIN = () => Number(process.env.TELEMETRY_MIN_SEC || 300) * 1000;
const REBOOT_TIMEOUT_MS = 2 * 3600 * 1000;
const keyOf = (m, p) => `${m}\u0000${p}`;

const status = { running: false, lastRunAt: null, durationMs: null, devices: 0, events: 0, samples: 0, error: null };

function projection(profiles) {
  const extra = profiles.flatMap(p => Object.values(p.parameterMap || {})).filter(v => typeof v === "string");
  return [...new Set([...t.PROJECTION, ...extra])];
}

async function* pages(fields) {
  for (let skip = 0; ; skip += PAGE) {
    const batch = await genie.listDevices({}, fields, { skip, limit: PAGE, sort: { _id: 1 } });
    if (batch.length) yield batch;
    if (batch.length < PAGE) return;
  }
}

async function register(doc) {
  const id = doc._deviceId || {};
  const dev = await Device.findOneAndUpdate(
    { genieacsDeviceId: doc._id },
    {
      $setOnInsert: {
        genieacsDeviceId: doc._id,
        serialNumber: id._SerialNumber || doc._id,
        manufacturer: id._Manufacturer || id._OUI || "unknown",
        productClass: id._ProductClass || "unknown",
        oui: id._OUI || "unknown"
      }
    },
    { upsert: true, new: true, lean: true }
  );
  return dev;
}

async function closeReboots(boots) {
  for (const { device, at, prevInform } of boots) {
    const log = await AuditLog.findOne({ device, action: "reboot", result: "pending", timestamp: { $lte: at, $gte: new Date(at - 6 * 3600 * 1000) } }).sort({ timestamp: -1 });
    if (!log) continue;
    const executedAt = Math.max(log.timestamp.getTime(), prevInform ? new Date(prevInform).getTime() : 0);
    const downtimeSec = Math.max(0, Math.round((at - executedAt) / 1000));
    log.result = "success";
    log.details = { ...log.details, completedAt: at, downtimeSec };
    await log.save();
    await DeviceEvent.updateOne({ device, type: "boot", at }, { $set: { "details.cause": "acs_reboot", "details.auditId": log._id, "details.downtimeSec": downtimeSec } });
  }
  await AuditLog.updateMany(
    { action: "reboot", result: "pending", timestamp: { $lt: new Date(Date.now() - REBOOT_TIMEOUT_MS) } },
    { $set: { result: "failed", errorMessage: "No boot seen within 2 h" } }
  );
}

async function syncAlerts(states, now) {
  const since = new Date(now - 3600 * 1000);
  const loops = await DeviceEvent.aggregate([{ $match: { type: "boot", at: { $gte: since } } }, { $group: { _id: "$device", n: { $sum: 1 } } }]);
  const boots = new Map(loops.map(l => [String(l._id), l.n]));
  const desired = new Map();
  for (const s of states) {
    for (const a of t.alertsFor({ ...s, boots: boots.get(String(s.device)) || 0, now })) desired.set(`${s.device}:${a.type}`, { device: s.device, ...a });
  }
  const open = await Alert.find({ open: true }, "device type").lean();
  const openKeys = new Set(open.map(a => `${a.device}:${a.type}`));
  const ops = [];
  for (const a of open) {
    const want = desired.get(`${a.device}:${a.type}`);
    if (want) ops.push({ updateOne: { filter: { _id: a._id }, update: { $set: { severity: want.severity, message: want.message, value: want.value, lastSeenAt: now } } } });
    else if (a.type !== "unknown_device") ops.push({ updateOne: { filter: { _id: a._id }, update: { $set: { open: false, closedAt: now } } } });
  }
  for (const [k, a] of desired) if (!openKeys.has(k)) ops.push({ insertOne: { document: { ...a, openedAt: now, lastSeenAt: now } } });
  if (ops.length) await Alert.bulkWrite(ops, { ordered: false });
}

async function run() {
  if (status.running) return status;
  status.running = true;
  const started = Date.now();
  const now = new Date();
  let devices = 0, eventCount = 0, sampleCount = 0;
  try {
    const profileList = await DeviceProfile.find().lean();
    const profiles = new Map(profileList.map(p => [keyOf(p.manufacturer, p.productClass), p]));
    const known = new Map((await Device.find({}, "genieacsDeviceId manufacturer productClass online mon removedAt lastSampleAt").lean()).map(d => [d.genieacsDeviceId, d]));
    const seen = new Set();
    const states = [];
    const boots = [];

    for await (const batch of pages(projection(profileList))) {
      const ops = [], samples = [], events = [];
      for (const doc of batch) {
        seen.add(doc._id);
        let dev = known.get(doc._id);
        if (!dev) {
          dev = await register(doc);
          const profile = profiles.get(keyOf(dev.manufacturer, dev.productClass));
          events.push({ device: dev._id, type: "registered", at: doc._registered ? new Date(doc._registered) : now, details: { serialNumber: dev.serialNumber, oui: dev.oui } });
          if (!profile?.verifiedOnRealDevice) {
            await Alert.updateOne(
              { device: dev._id, type: "unknown_device", open: true },
              { $setOnInsert: { severity: profile ? "info" : "warn", message: `New ${dev.manufacturer} ${dev.productClass} (${dev.serialNumber}) registered; ${profile ? "profile not verified" : "no profile"}`, openedAt: now, lastSeenAt: now } },
              { upsert: true }
            );
          }
        }
        const profile = profiles.get(keyOf(dev.manufacturer, dev.productClass)) || {};
        const cur = t.sample(doc, profile);
        const online = t.isOnline(cur.lastInform, cur.informInterval, now);
        const prev = dev.mon;
        const changed = !prev || +new Date(prev.lastInform || 0) !== +(cur.lastInform || 0);

        for (const e of t.detect(prev, cur)) {
          events.push({ device: dev._id, ...e });
          if (e.type === "boot") boots.push({ device: dev._id, at: e.at, prevInform: prev?.lastInform });
        }
        if (dev.online !== undefined && dev.online !== null && dev.online !== online) {
          events.push(online
            ? { device: dev._id, type: "online", at: cur.lastInform || now }
            : { device: dev._id, type: "offline", at: now, details: { lastInform: cur.lastInform } });
        }

        const set = {
          mon: cur, online, lastInformAt: cur.lastInform || undefined, informInterval: cur.informInterval,
          offlineSince: online ? null : cur.lastInform,
          ...(cur.lastBoot && { lastBootAt: cur.lastBoot }),
          ...(cur.pppoeUsername && { pppoeUsername: cur.pppoeUsername }),
          ...(cur.macAddress && { macAddress: cur.macAddress }),
          ...(cur.wanIp && { wanIp: cur.wanIp }),
          ...(cur.softwareVersion && { softwareVersion: cur.softwareVersion }),
          ...(cur.rxDbm !== null && { rxPower: cur.rxDbm, rxGrade: cur.rxGrade })
        };
        if (!cur.lastBoot && cur.lastInform && cur.uptime !== null) set.lastBootAt = new Date(cur.lastInform - cur.uptime * 1000);
        if (changed && cur.lastInform && (!dev.lastSampleAt || now - new Date(dev.lastSampleAt) >= SAMPLE_MIN())) {
          samples.push({
            at: cur.lastInform, device: dev._id, rx: cur.rxDbm, tx: cur.txDbm, temp: cur.tempC, fec: cur.fecErrors,
            uptime: cur.uptime, pppUptime: cur.pppUptime, wanUp: cur.wanUp, bytesIn: cur.bytesIn, bytesOut: cur.bytesOut
          });
          set.lastSampleAt = now;
        }
        ops.push({ updateOne: { filter: { _id: dev._id }, update: { $set: set, ...(dev.removedAt && { $unset: { removedAt: "" } }) } } });
        states.push({ device: dev._id, online, mon: cur, verified: !!profile.verifiedOnRealDevice });
      }
      if (ops.length) await Device.bulkWrite(ops, { ordered: false });
      if (samples.length) await Telemetry.insertMany(samples, { ordered: false });
      if (events.length) await DeviceEvent.insertMany(events, { ordered: false });
      devices += batch.length;
      eventCount += events.length;
      sampleCount += samples.length;
    }

    await Device.updateMany({ genieacsDeviceId: { $nin: [...seen] }, removedAt: null }, { $set: { removedAt: now, online: null } });
    await closeReboots(boots);
    await syncAlerts(states, now);
    Object.assign(status, { error: null });
  } catch (err) {
    status.error = err.message;
    console.error("monitor:", err.message);
  } finally {
    Object.assign(status, { running: false, lastRunAt: now, durationMs: Date.now() - started, devices, events: eventCount, samples: sampleCount });
  }
  return status;
}

let timer = null;
function start() {
  if (timer || process.env.MONITOR_ENABLED === "false") return;
  const loop = async () => {
    await run();
    timer = setTimeout(loop, INTERVAL());
  };
  timer = setTimeout(loop, 3000);
}

module.exports = { run, start, status };
