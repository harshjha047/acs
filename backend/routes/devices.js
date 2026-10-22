const router = require("express").Router();
const { isValidObjectId } = require("mongoose");
const genie = require("../genieacsClient");
const Device = require("../models/Device");
const DeviceNote = require("../models/DeviceNote");
const DeviceProfile = require("../models/DeviceProfile");
const Customer = require("../models/Customer");
const AuditLog = require("../models/AuditLog");
const { requireAuth, requireRole } = require("../middleware/auth");
const { rootOf, leaves, get, valueOf } = require("../lib/tree");
const { ROOTS } = require("../lib/catalog");
const view = require("../lib/deviceView");
const diag = require("../lib/diagnostics");

router.use(requireAuth);

router.param("id", async (req, res, next, id) => {
  if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid device id" });
  req.device = await Device.findById(id);
  if (!req.device) return res.status(404).json({ error: "Device not found" });
  next();
});

const SENSITIVE = /password|passphrase|presharedkey|wepkey|secret/i;
const DEVICE_ID_PROJECTION = ["_deviceId", "_lastInform"];
const HOST_RE = /^(?=.{1,253}$)(([a-z0-9-]{1,63}\.)*[a-z0-9-]{1,63}|\d{1,3}(\.\d{1,3}){3}|[0-9a-f:]+)$/i;
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const statusFor = outcome => (outcome === "success" ? 200 : 202);

async function audit(req, action, run) {
  const log = await AuditLog.create({ user: req.user.id, device: req.device._id, action });
  try {
    const { result = "success", details } = await run();
    Object.assign(log, { result, details });
    await log.save();
    return details;
  } catch (err) {
    Object.assign(log, { result: "failed", errorMessage: err.message });
    await log.save();
    throw err;
  }
}

async function loadTree(req) {
  const doc = await genie.getDevice(req.device.genieacsDeviceId);
  if (!doc) throw Object.assign(new Error("Device not found in GenieACS"), { status: 404 });
  return doc;
}

const findProfile = d => DeviceProfile.findOne({ manufacturer: d.manufacturer, productClass: d.productClass }).lean();

async function learnProfile(device, profile, summary) {
  const learned = view.learnedMap(summary);
  if (!profile) {
    await DeviceProfile.updateOne(
      { manufacturer: device.manufacturer, productClass: device.productClass },
      { $setOnInsert: { oui: device.oui, parameterMap: learned, autoLearned: true } },
      { upsert: true }
    );
  } else if (profile.autoLearned && !profile.verifiedOnRealDevice) {
    const missing = Object.fromEntries(Object.entries(learned).filter(([k]) => !profile.parameterMap?.[k]));
    if (Object.keys(missing).length) {
      await DeviceProfile.updateOne({ _id: profile._id }, { $set: Object.fromEntries(Object.entries(missing).map(([k, v]) => [`parameterMap.${k}`, v])) });
    }
  }
}

async function buildSummary(req, doc) {
  const profile = await findProfile(req.device);
  const s = view.summary(doc, profile || {});
  const p = s.wan.primary;
  await Device.updateOne({ _id: req.device._id }, {
    $set: {
      pppoeUsername: p?.Username || undefined,
      macAddress: p?.MACAddress?.toLowerCase() || undefined,
      wanIp: p?.ExternalIPAddress || undefined,
      softwareVersion: s.identity.softwareVersion || undefined,
      ...(s.optical.rxPower.dbm !== null && { rxPower: s.optical.rxPower.dbm, rxGrade: s.optical.rxPower.grade }),
      informInterval: s.online.interval,
      lastSummaryAt: new Date()
    },
    ...(s.optical.rxPower.dbm === null && { $unset: { rxPower: 1, rxGrade: 1 } })
  });
  await learnProfile(req.device, profile, s);
  return { summary: s, profile };
}

router.get("/", async (req, res) => {
  const genieDevices = await genie.listDevices({}, DEVICE_ID_PROJECTION);
  if (genieDevices.length) {
    await Device.bulkWrite(genieDevices.map(d => {
      const id = d._deviceId || {};
      return {
        updateOne: {
          filter: { genieacsDeviceId: d._id },
          update: {
            $setOnInsert: {
              genieacsDeviceId: d._id,
              serialNumber: id._SerialNumber || d._id,
              manufacturer: id._Manufacturer || id._OUI || "unknown",
              productClass: id._ProductClass || "unknown",
              oui: id._OUI || "unknown"
            },
            ...(d._lastInform && { $set: { lastInformAt: new Date(d._lastInform) } }),
            $unset: { removedAt: "" }
          },
          upsert: true
        }
      };
    }), { ordered: false });
  }
  await Device.updateMany(
    { genieacsDeviceId: { $nin: genieDevices.map(d => d._id) }, removedAt: null },
    { $set: { removedAt: new Date() } }
  );

  const q = String(req.query.q || "").trim().slice(0, 100);
  const filter = { removedAt: null };
  if (q) {
    const re = new RegExp(escapeRe(q), "i");
    const customers = await Customer.find({ $or: [{ name: re }, { phone: re }, { accountId: re }, { email: re }] }, "_id").limit(50).lean();
    filter.$or = [
      { serialNumber: re }, { genieacsDeviceId: re }, { pppoeUsername: re }, { macAddress: re }, { wanIp: re },
      ...(customers.length ? [{ customer: { $in: customers.map(c => c._id) } }] : [])
    ];
  }
  res.json(await Device.find(filter).populate("customer", "name phone accountId").sort({ lastInformAt: -1 }).limit(500).lean());
});

router.get("/:id", async (req, res) => res.json(await req.device.populate("customer")));

router.get("/:id/summary", async (req, res) => {
  const { summary } = await buildSummary(req, await loadTree(req));
  res.json(summary);
});

router.get("/:id/clients", async (req, res) => {
  const doc = await loadTree(req);
  res.json({ clients: view.clients(doc), lanPorts: view.lanPorts(doc), lastInform: doc._lastInform });
});

router.get("/:id/wifi", async (req, res) => {
  const doc = await loadTree(req);
  res.json(view.wifi(doc).map(({ writePaths, ...r }) => ({ ...r, editable: Object.fromEntries(Object.entries(writePaths).map(([k, v]) => [k, !!v])) })));
});

function wifiValues(radio, body) {
  const w = radio.writePaths;
  const values = [];
  const need = (key, label) => {
    if (!w[key]) throw Object.assign(new Error(`${label} is not supported on this device`), { status: 422 });
    return w[key];
  };
  if (body.ssid !== undefined) {
    if (typeof body.ssid !== "string" || !/^[\x20-\x7e]{1,32}$/.test(body.ssid)) throw Object.assign(new Error("SSID must be 1-32 printable characters"), { status: 400 });
    values.push([need("ssid", "SSID"), body.ssid, "xsd:string"]);
  }
  if (body.password !== undefined && body.password !== "") {
    if (typeof body.password !== "string" || !/^[\x20-\x7e]{8,63}$/.test(body.password)) throw Object.assign(new Error("Password must be 8-63 printable characters"), { status: 400 });
    values.push([need("password", "Password change"), body.password, "xsd:string"]);
  }
  if (body.enabled !== undefined) values.push([need("enabled", "Enable/disable"), !!body.enabled, "xsd:boolean"]);
  if (body.hidden !== undefined) values.push([need("advertise", "Hide SSID"), !body.hidden, "xsd:boolean"]);
  if (body.autoChannel !== undefined) values.push([need("autoChannel", "Auto channel"), !!body.autoChannel, "xsd:boolean"]);
  if (body.channel !== undefined && body.channel !== null && body.channel !== "" && !body.autoChannel) {
    const ch = Number(body.channel);
    if (!Number.isInteger(ch) || ch < 1 || ch > 196) throw Object.assign(new Error("Invalid channel"), { status: 400 });
    values.push([need("channel", "Channel"), ch, "xsd:unsignedInt"]);
  }
  if (!values.length) throw Object.assign(new Error("Nothing to change"), { status: 400 });
  return values;
}

router.put("/:id/wifi", async (req, res) => {
  const doc = await loadTree(req);
  const radio = view.wifi(doc).find(r => r.id === req.body?.id);
  if (!radio) return res.status(404).json({ error: "Wi-Fi interface not found" });
  const values = wifiValues(radio, req.body);
  const details = await audit(req, "wifi_update", async () => {
    const { outcome, task } = await genie.setParameterValues(req.device.genieacsDeviceId, values, { timeout: 15000 });
    return {
      result: outcome,
      details: {
        outcome, taskId: task?._id, interface: radio.id,
        changes: values.map(([p, v]) => [p, SENSITIVE.test(p) ? "(changed)" : v]),
        before: { ssid: radio.ssid, enabled: radio.enabled, channel: radio.channel, hidden: radio.hidden }
      }
    };
  });
  res.status(statusFor(details.outcome)).json(details);
});

router.post("/:id/refresh", async (req, res) => {
  const scope = ["summary", "clients", "full"].includes(req.query.scope) ? req.query.scope : "summary";
  const doc = await loadTree(req);
  const root = rootOf(doc);
  if (!root) return res.status(422).json({ error: "Data model root not found" });
  const id = req.device.genieacsDeviceId;
  const details = await audit(req, "refresh", async () => {
    let outcome;
    if (scope === "full") {
      ({ outcome } = await genie.refreshObject(id, root, { timeout: 120000 }));
    } else {
      const objects = ROOTS[root].refresh[scope].filter(p => get(doc, p) !== undefined);
      ({ outcome } = await genie.queueTasks(id, (objects.length ? objects : [root]).map(objectName => ({ name: "refreshObject", objectName })), { timeout: 30000 }));
    }
    return { result: outcome, details: { outcome, scope } };
  });
  res.status(statusFor(details.outcome)).json(details);
});

async function startDiagnostic(req, kind, args) {
  const doc = await loadTree(req);
  const primary = view.wanConnections(doc).length ? view.summary(doc).wan.primary : null;
  const values = diag.request(doc, kind, args, primary?.path);
  return audit(req, kind === "ping" ? "ping" : "speed_test", async () => {
    const { outcome, task } = await genie.setParameterValues(req.device.genieacsDeviceId, values, { timeout: 15000 });
    return { result: outcome, details: { outcome, taskId: task?._id, ...args, interface: values.find(([p]) => p.endsWith(".Interface"))?.[1] || null } };
  });
}

const TERMINAL = ["complete", "error"];

async function readDiagnostic(req, kind) {
  let doc = await loadTree(req);
  const action = kind === "ping" ? "ping" : "speed_test";
  const last = await AuditLog.findOne({ device: req.device._id, action }).sort({ timestamp: -1 });
  const taskId = last?.details?.taskId;
  const faults = taskId ? await genie.getFaults(req.device.genieacsDeviceId).catch(() => []) : [];
  const fault = faults.find(f => f._id === `${req.device.genieacsDeviceId}:task_${taskId}`);
  const isFresh = r => !!(r.checkedAt && last && new Date(r.checkedAt) >= last.timestamp);
  let result = diag.read(doc, kind);

  if (req.query.live && last && !fault && !(isFresh(result) && TERMINAL.includes(result.state))) {
    const paths = diag.resultPaths(doc, kind);
    if (paths.length) {
      const { outcome } = await genie.getParameterValues(req.device.genieacsDeviceId, paths, { timeout: 8000 }).catch(() => ({}));
      if (outcome === "success") result = diag.read((doc = await loadTree(req)), kind);
    }
  }

  const fresh = isFresh(result);
  if (last && !last.details?.testState && (fault || (fresh && TERMINAL.includes(result.state)))) {
    const failed = !!fault || result.state === "error";
    last.result = failed ? "failed" : "success";
    last.details = { ...last.details, testState: fault ? "fault" : result.state, testRawState: result.rawState };
    if (fault) last.errorMessage = fault.detail || fault.message;
    else if (failed) last.errorMessage = result.rawState;
    await last.save();
  }
  return {
    ...result, stale: !!last && !fresh, requestedAt: last?.timestamp || null,
    fault: fault ? { code: fault.code, message: fault.message, detail: fault.detail?.faultString || null } : null
  };
}

router.post("/:id/diagnostics/ping", async (req, res) => {
  const host = String(req.body?.host || "8.8.8.8").trim();
  const count = Math.min(Math.max(parseInt(req.body?.count, 10) || 4, 1), 10);
  if (!HOST_RE.test(host)) return res.status(400).json({ error: "Invalid host" });
  const details = await startDiagnostic(req, "ping", { host, count });
  res.status(statusFor(details.outcome)).json(details);
});

router.get("/:id/diagnostics/ping", async (req, res) => res.json(await readDiagnostic(req, "ping")));

router.post("/:id/diagnostics/speed", async (req, res) => {
  const url = process.env.SPEEDTEST_URL;
  if (!url) return res.status(503).json({ error: "SPEEDTEST_URL is not configured" });
  const details = await startDiagnostic(req, "speed", { url });
  res.status(statusFor(details.outcome)).json(details);
});

router.get("/:id/diagnostics/speed", async (req, res) => res.json(await readDiagnostic(req, "speed")));

router.get("/:id/readiness", async (req, res) => {
  const doc = await loadTree(req);
  const { summary, profile } = await buildSummary(req, doc);
  res.json({ ...view.readiness(doc, summary), profile: profile ? { verified: profile.verifiedOnRealDevice, parameterMap: profile.parameterMap, units: profile.units } : null });
});

router.get("/:id/capture", async (req, res) => {
  const doc = await loadTree(req);
  const { summary } = await buildSummary(req, doc);
  const root = rootOf(doc);
  const parameters = root ? leaves(doc[root], root).map(([path, n]) => ({
    path, value: SENSITIVE.test(path) && n._value ? "(hidden)" : n._value ?? null, type: n._type ?? null, writable: !!n._writable
  })) : [];
  const faults = await genie.getFaults(req.device.genieacsDeviceId).catch(() => []);
  await AuditLog.create({ user: req.user.id, device: req.device._id, action: "capture", result: "success", details: { parameters: parameters.length } });
  const name = `capture-${req.device.manufacturer}-${req.device.productClass}-${req.device.serialNumber}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`
    .replace(/[^A-Za-z0-9._-]/g, "_");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.json({
    capturedAt: new Date(), deviceId: doc._id, deviceIdentity: doc._deviceId, lastInform: doc._lastInform, registered: doc._registered,
    readiness: view.readiness(doc, summary), summary, clients: view.clients(doc), lanPorts: view.lanPorts(doc),
    wifi: view.wifi(doc), faults, parameters
  });
});

router.get("/:id/parameters", async (req, res) => {
  const doc = await loadTree(req);
  const root = rootOf(doc);
  const parameters = root ? leaves(doc[root], root).map(([path, n]) => ({
    path,
    value: SENSITIVE.test(path) && n._value ? "(hidden)" : n._value ?? null,
    type: n._type ?? null,
    writable: !!n._writable,
    timestamp: n._timestamp ?? null
  })) : [];
  await AuditLog.create({
    user: req.user.id, device: req.device._id, action: "diagnostics_view",
    details: { view: "parameters", count: parameters.length }, result: "success"
  });
  res.json({ root, lastInform: doc._lastInform, parameters });
});

router.get("/:id/diagnostics", async (req, res) => {
  const details = await audit(req, "diagnostics_view", async () => {
    const { summary } = await buildSummary(req, await loadTree(req));
    return {
      details: {
        lastInform: summary.lastInform, uptime: summary.uptime, wanIp: summary.wan.primary?.ExternalIPAddress ?? null,
        ssid: summary.wifi.find(w => w.enabled)?.ssid ?? null, connectedDevices: summary.counts.activeClients,
        rxPower: summary.optical.rxPower.dbm
      }
    };
  });
  res.json(details);
});

const reasonOf = req => String(req.body?.reason || "").trim().slice(0, 500);

router.post("/:id/reboot", requireRole("noc", "admin"), async (req, res) => {
  const reason = reasonOf(req);
  if (!reason) return res.status(400).json({ error: "Reason is required" });
  const details = await audit(req, "reboot", async () => {
    const { outcome, reason: nbiReason, task } = await genie.reboot(req.device.genieacsDeviceId);
    return { result: outcome, details: { outcome, reason, nbiReason, taskId: task?._id } };
  });
  res.status(statusFor(details.outcome)).json(details);
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
  const reason = reasonOf(req);
  if (!reason) return res.status(400).json({ error: "Reason is required" });
  const details = await audit(req, "device_remove", async () => {
    const existed = await genie.deleteDevice(req.device.genieacsDeviceId);
    await Device.updateOne({ _id: req.device._id }, { $set: { removedAt: new Date(), status: "decommissioned" } });
    return { details: { reason, genieacsDeviceId: req.device.genieacsDeviceId, existedInGenieacs: existed } };
  });
  res.json(details);
});

router.get("/:id/faults", async (req, res) => {
  const faults = await genie.getFaults(req.device.genieacsDeviceId);
  res.json(faults.map(f => ({ id: f._id, channel: f.channel, code: f.code, message: f.message, detail: f.detail?.faultString || null, retries: f.retries, timestamp: f.timestamp })));
});

router.get("/:id/notes", async (req, res) => {
  res.json(await DeviceNote.find({ device: req.device._id }).sort({ createdAt: -1 }).limit(200).populate("user", "name").lean());
});

router.post("/:id/notes", async (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text || text.length > 2000) return res.status(400).json({ error: "Note must be 1-2000 characters" });
  const note = await DeviceNote.create({ device: req.device._id, user: req.user.id, text });
  res.status(201).json(await note.populate("user", "name"));
});

router.get("/:id/timeline", async (req, res) => {
  const [logs, notes, doc, faults] = await Promise.all([
    AuditLog.find({ device: req.device._id }).sort({ timestamp: -1 }).limit(100).populate("user", "name").lean(),
    DeviceNote.find({ device: req.device._id }).sort({ createdAt: -1 }).limit(100).populate("user", "name").lean(),
    genie.getDevice(req.device.genieacsDeviceId, ["_registered", "_lastInform", "InternetGatewayDevice.DeviceInfo.UpTime", "Device.DeviceInfo.UpTime"]).catch(() => null),
    genie.getFaults(req.device.genieacsDeviceId).catch(() => [])
  ]);
  const events = [
    ...logs.map(l => ({ type: "action", at: l.timestamp, action: l.action, result: l.result, user: l.user?.name, details: l.details, error: l.errorMessage })),
    ...notes.map(n => ({ type: "note", at: n.createdAt, user: n.user?.name, text: n.text })),
    ...faults.map(f => ({ type: "fault", at: f.timestamp, code: f.code, message: f.message, detail: f.detail?.faultString || null }))
  ];
  if (doc?._registered) events.push({ type: "system", at: doc._registered, text: "First connected to ACS" });
  const uptime = Number(valueOf(get(doc || {}, "InternetGatewayDevice.DeviceInfo.UpTime")) ?? valueOf(get(doc || {}, "Device.DeviceInfo.UpTime")));
  if (doc?._lastInform && Number.isFinite(uptime)) events.push({ type: "system", at: new Date(Date.parse(doc._lastInform) - uptime * 1000), text: "Device booted" });
  res.json(events.sort((a, b) => new Date(b.at) - new Date(a.at)));
});

router.put("/:id/customer", async (req, res) => {
  const customerId = req.body?.customerId ?? null;
  if (customerId !== null && (!isValidObjectId(customerId) || !(await Customer.exists({ _id: customerId })))) {
    return res.status(400).json({ error: "Invalid customer" });
  }
  const previous = req.device.customer;
  req.device.customer = customerId;
  await req.device.save();
  await AuditLog.create({ user: req.user.id, device: req.device._id, action: "customer_link", result: "success", details: { from: previous, to: customerId } });
  res.json(await req.device.populate("customer"));
});

module.exports = router;
