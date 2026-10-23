const router = require("express").Router();
const { isValidObjectId } = require("mongoose");
const genie = require("../genieacsClient");
const Device = require("../models/Device");
const DeviceNote = require("../models/DeviceNote");
const DeviceProfile = require("../models/DeviceProfile");
const Customer = require("../models/Customer");
const AuditLog = require("../models/AuditLog");
const rateLimit = require("express-rate-limit");
const { requireAuth, requireRole } = require("../middleware/auth");
const { rootOf, leaves, get } = require("../lib/tree");
const { ROOTS } = require("../lib/catalog");
const view = require("../lib/deviceView");
const diag = require("../lib/diagnostics");
const Alert = require("../models/Alert");
const Telemetry = require("../models/Telemetry");
const DeviceEvent = require("../models/DeviceEvent");
const { series } = require("../lib/telemetry");
const { capabilities } = require("../lib/capabilities");
const sink = require("../lib/uploadSink");
const Template = require("../models/ProvisioningTemplate");
const provisioner = require("../lib/provisioner");
const prov = require("../lib/provisioning");

router.use(requireAuth);

const actionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: req => req.user.id,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many actions in a minute. Wait a moment and try again." }
});
router.use((req, res, next) => (req.method === "GET" ? next() : actionLimiter(req, res, next)));

const inflight = new Set();
const DUPLICATE = {
  reboot: t => t.name === "reboot",
  refresh: t => t.name === "refreshObject" || t.name === "getParameterValues",
  wifi: t => t.name === "setParameterValues" && t.parameterValues?.some(([p]) => /WLANConfiguration|\.WiFi\./.test(p)),
  diagnostic: t => t.name === "setParameterValues" && t.parameterValues?.some(([p]) => p.endsWith(".DiagnosticsState"))
};
const DUPLICATE_MSG = {
  reboot: "A reboot is already queued for this device. It runs at the next check-in.",
  refresh: "A refresh is already queued for this device. It runs at the next check-in.",
  wifi: "A Wi-Fi change is already waiting for this device. It applies at the next check-in.",
  diagnostic: "A test is already queued for this device. It runs at the next check-in."
};

function once(kind) {
  return async (req, res, next) => {
    const key = `${req.device._id}:${kind}`;
    if (inflight.has(key)) return res.status(409).json({ error: DUPLICATE_MSG[kind], duplicate: true });
    const tasks = await genie.getTasks(req.device.genieacsDeviceId).catch(() => []);
    if (tasks.some(DUPLICATE[kind])) return res.status(409).json({ error: DUPLICATE_MSG[kind], duplicate: true });
    inflight.add(key);
    res.on("close", () => inflight.delete(key));
    next();
  };
}

const BULK = {
  tag: { roles: ["noc", "admin"], max: 500 },
  untag: { roles: ["noc", "admin"], max: 500 },
  reboot: { roles: ["admin"], max: 50, reason: true },
  provision: { roles: ["admin"], max: 200, reason: true }
};

async function pool(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

router.post("/bulk", async (req, res) => {
  const { action, ids, tag, templateId } = req.body || {};
  const spec = BULK[action];
  if (!spec) return res.status(400).json({ error: "Unknown bulk action" });
  if (!spec.roles.includes(req.user.role)) return res.status(403).json({ error: "Not allowed for your role" });
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter(isValidObjectId);
  if (!list.length) return res.status(400).json({ error: "Select at least one device" });
  if (list.length > spec.max) return res.status(400).json({ error: `At most ${spec.max} devices per ${action}` });
  const reason = reasonOf(req);
  if (spec.reason && !reason) return res.status(400).json({ error: "Reason is required" });

  const devices = await Device.find({ _id: { $in: list }, removedAt: null });
  const bulkId = `bulk-${Date.now().toString(36)}`;
  const found = new Set(devices.map(d => String(d._id)));
  const results = list.filter(id => !found.has(id)).map(id => ({ id, outcome: "failed", error: "Device not found" }));
  const row = (d, outcome, error) => ({ id: String(d._id), serialNumber: d.serialNumber, outcome, ...(error && { error }) });

  if (action === "tag" || action === "untag") {
    const [t] = prov.normTags([tag]);
    if (!t) return res.status(400).json({ error: "Tag is required" });
    await Device.updateMany({ _id: { $in: devices.map(d => d._id) } }, action === "tag" ? { $addToSet: { tags: t } } : { $pull: { tags: t } });
    await AuditLog.insertMany(devices.map(d => ({ user: req.user.id, device: d._id, action: "tag_update", result: "success", details: { bulkId, op: action, tag: t } })));
    results.push(...devices.map(d => row(d, "done")));
  }

  if (action === "reboot") {
    results.push(...(await pool(devices, 5, async d => {
      const tasks = await genie.getTasks(d.genieacsDeviceId).catch(() => []);
      if (tasks.some(DUPLICATE.reboot)) return row(d, "skipped", "Reboot already queued");
      const log = await AuditLog.create({ user: req.user.id, device: d._id, action: "reboot", details: { reason, bulkId } });
      try {
        const { outcome, task } = await genie.queueTask(d.genieacsDeviceId, { name: "reboot" }, { connectionRequest: false });
        await AuditLog.updateOne({ _id: log._id }, { $set: { result: outcome, "details.outcome": outcome, "details.taskId": task?._id } });
        return row(d, "queued");
      } catch (err) {
        await AuditLog.updateOne({ _id: log._id }, { $set: { result: "failed", errorMessage: err.message } });
        return row(d, "failed", err.message);
      }
    })));
  }

  if (action === "provision") {
    if (!isValidObjectId(templateId)) return res.status(400).json({ error: "Pick a template" });
    const template = await Template.findById(templateId).lean();
    if (!template?.isActive) return res.status(400).json({ error: "Template not found or inactive" });
    if (template.wifi?.ssid && !/\{\w+\}/.test(template.wifi.ssid)) return res.status(400).json({ error: "This template sets a fixed SSID; bulk apply needs a pattern with tokens such as {serial4}" });
    for (const d of devices) {
      results.push(await provisioner.request(d, { template, user: req.user.id }).then(() => row(d, "queued"), err => row(d, "skipped", err.message)));
    }
  }

  const count = k => results.filter(r => r.outcome === k).length;
  res.json({ bulkId, action, reason: reason || undefined, results, summary: { done: count("done") + count("queued"), skipped: count("skipped"), failed: count("failed") } });
});

router.param("id", async (req, res, next, id) => {
  if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid device id" });
  req.device = await Device.findById(id);
  if (!req.device) return res.status(404).json({ error: "Device not found" });
  next();
});

const { isSensitive, mask } = require("../lib/sensitive");
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
  if (req.query.state === "online") filter.online = true;
  if (req.query.state === "offline") filter.online = false;
  if (req.query.state === "lowrx") filter.rxGrade = { $in: ["warn", "bad"] };
  if (req.query.state === "alerts") filter._id = { $in: await Alert.distinct("device", { open: true }) };
  if (req.query.tag) filter.tags = String(req.query.tag).toLowerCase();
  if (["pending", "queued", "applied", "failed"].includes(req.query.prov)) filter["provisioning.state"] = req.query.prov;
  const devices = await Device.find(filter, "-mon").populate("customer", "name phone accountId").sort({ lastInformAt: -1 }).limit(500).lean();
  const alerts = await Alert.find({ open: true, device: { $in: devices.map(d => d._id) } }, "device type severity").lean();
  const byDevice = Map.groupBy(alerts, a => String(a.device));
  res.json(devices.map(d => ({ ...d, alerts: (byDevice.get(String(d._id)) || []).map(({ type, severity }) => ({ type, severity })) })));
});

router.get("/:id", async (req, res) => {
  const device = await req.device.populate("customer");
  const alerts = await Alert.find({ device: req.device._id, open: true }).sort({ openedAt: -1 }).lean();
  const { mon, ...rest } = device.toObject();
  res.json({ ...rest, alerts });
});

router.get("/:id/provisioning", async (req, res) => {
  const d = await Device.findById(req.device._id).select("+provisioning.overrides")
    .populate("provisioning.template", "name").populate("provisioning.requestedBy", "name").lean();
  const { overrides, ...rest } = d.provisioning || {};
  res.json({ ...rest, tags: d.tags || [], hasPassword: !!overrides?.password });
});

router.get("/:id/provisioning/secret", requireRole("noc", "admin"), async (req, res) => {
  const d = await Device.findById(req.device._id, "+provisioning.overrides").lean();
  const password = d.provisioning?.overrides?.password || null;
  await AuditLog.create({ user: req.user.id, device: req.device._id, action: "secret_view", result: "success", details: { what: "provisioned Wi-Fi password", found: !!password } });
  res.json({ password });
});

router.post("/:id/provision", requireRole("admin"), async (req, res) => {
  const { templateId, ssid, ssid5, password } = req.body || {};
  const reason = reasonOf(req);
  if (!reason) return res.status(400).json({ error: "Reason is required" });
  if (!isValidObjectId(templateId)) return res.status(400).json({ error: "Pick a template" });
  for (const [v, label] of [[ssid, "SSID"], [ssid5, "5 GHz SSID"]]) if (v && !prov.SSID_RE.test(v)) return res.status(400).json({ error: `${label} must be 1-32 printable characters` });
  if (password && !prov.PSK_RE.test(password)) return res.status(400).json({ error: "Password must be 8-63 printable characters" });
  await provisioner.request(req.device, { template: templateId, user: req.user.id, overrides: { ssid, ssid5, password } });
  const device = await Device.findById(req.device._id).select("+provisioning.overrides");
  const outcome = await provisioner.processOne(device, { connectionRequest: true });
  const after = await Device.findById(req.device._id, "provisioning").lean();
  if (after.provisioning.auditId) await AuditLog.updateOne({ _id: after.provisioning.auditId }, { $set: { "details.reason": reason } });
  res.status(after.provisioning.state === "applied" ? 200 : 202).json({ ...after.provisioning, outcome });
});

router.put("/:id/tags", requireRole("noc", "admin"), async (req, res) => {
  const tags = prov.normTags(req.body?.tags);
  const before = req.device.tags;
  req.device.tags = tags;
  await req.device.save();
  await AuditLog.create({ user: req.user.id, device: req.device._id, action: "tag_update", result: "success", details: { from: before, to: tags } });
  res.json({ tags });
});

router.get("/:id/telemetry", async (req, res) => {
  const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 720);
  const since = new Date(Date.now() - hours * 3600 * 1000);
  const [points, events] = await Promise.all([
    Telemetry.find({ device: req.device._id, at: { $gte: since } }, "-_id -device").sort({ at: 1 }).lean(),
    DeviceEvent.find({ device: req.device._id, at: { $gte: since } }, "-_id -device").sort({ at: -1 }).limit(500).lean()
  ]);
  res.json({ hours, points: series(points), events });
});

router.get("/:id/events", async (req, res) => {
  res.json(await DeviceEvent.find({ device: req.device._id }, "-device").sort({ at: -1 }).limit(Math.min(Number(req.query.limit) || 200, 1000)).lean());
});

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

router.put("/:id/wifi", once("wifi"), async (req, res) => {
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
        changes: values.map(([p, v]) => [p, isSensitive(p, v) ? "(changed)" : v]),
        before: { ssid: radio.ssid, enabled: radio.enabled, channel: radio.channel, hidden: radio.hidden }
      }
    };
  });
  res.status(statusFor(details.outcome)).json(details);
});

router.post("/:id/refresh", once("refresh"), async (req, res) => {
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
  return audit(req, diag.actionOf(kind), async () => {
    const { outcome, task } = await genie.setParameterValues(req.device.genieacsDeviceId, values, { timeout: 15000 });
    return { result: outcome, details: { outcome, taskId: task?._id, ...args, ...(args.url && { url: sink.redact(args.url) }), interface: values.find(([p]) => p.endsWith(".Interface"))?.[1] || null } };
  });
}

const TERMINAL = ["complete", "error"];

async function readDiagnostic(req, kind) {
  let doc = await loadTree(req);
  const last = await AuditLog.findOne({ device: req.device._id, action: diag.actionOf(kind) }).sort({ timestamp: -1 });
  const taskId = last?.details?.taskId;
  const faults = taskId ? await genie.getFaults(req.device.genieacsDeviceId).catch(() => []) : [];
  const fault = faults.find(f => f._id === `${req.device.genieacsDeviceId}:task_${taskId}`);
  const isFresh = r => !!(r.checkedAt && last && new Date(r.checkedAt) >= last.timestamp);
  let result = diag.read(doc, kind);

  if (req.query.live && last && !fault && !(isFresh(result) && TERMINAL.includes(result.state))) {
    const task = diag.liveTask(doc, kind);
    if (task) {
      const { outcome } = await genie.queueTask(req.device.genieacsDeviceId, task, { timeout: 8000 }).catch(() => ({}));
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

const clamp = (v, lo, hi, d) => Math.min(Math.max(parseInt(v, 10) || d, lo), hi);
function hostArg(body) {
  const host = String(body?.host || "8.8.8.8").trim();
  if (!HOST_RE.test(host)) throw Object.assign(new Error("Invalid host"), { status: 400 });
  return host;
}
const DIAG_ARGS = {
  ping: body => ({ host: hostArg(body), count: clamp(body?.count, 1, 10, 4) }),
  traceroute: body => ({ host: hostArg(body), maxHops: clamp(body?.maxHops, 1, 30, 20), tries: clamp(body?.tries, 1, 3, 3) }),
  speed: () => {
    if (!process.env.SPEEDTEST_URL) throw Object.assign(new Error("SPEEDTEST_URL is not configured"), { status: 503 });
    return { url: process.env.SPEEDTEST_URL };
  },
  upload: () => {
    if (!process.env.SPEEDTEST_UPLOAD_BASE) throw Object.assign(new Error("SPEEDTEST_UPLOAD_BASE is not configured"), { status: 503 });
    return { url: sink.url(), bytes: sink.testBytes() };
  }
};
const knownKind = (req, res, next) => (DIAG_ARGS[req.params.kind] ? next() : res.status(404).json({ error: "Unknown test" }));

function diagArgs(req, res, next) {
  try {
    req.diagArgs = DIAG_ARGS[req.params.kind](req.body);
    next();
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
}

router.post("/:id/diagnostics/:kind", knownKind, diagArgs, once("diagnostic"), async (req, res) => {
  const details = await startDiagnostic(req, req.params.kind, req.diagArgs);
  res.status(statusFor(details.outcome)).json(details);
});

router.get("/:id/diagnostics/:kind", knownKind, async (req, res) => {
  const r = await readDiagnostic(req, req.params.kind);
  res.json(r.url ? { ...r, url: sink.redact(r.url) } : r);
});

router.get("/:id/capabilities", async (req, res) => {
  const doc = await loadTree(req);
  const { summary, profile } = await buildSummary(req, doc);
  const caps = capabilities(doc, summary, profile || {});
  await Device.updateOne({ _id: req.device._id }, { $set: { capabilities: Object.fromEntries(Object.entries(caps).map(([k, v]) => [k, v.supported])) } });
  res.json(caps);
});

router.get("/:id/readiness", async (req, res) => {
  const doc = await loadTree(req);
  const { summary, profile } = await buildSummary(req, doc);
  const tasks = await genie.getTasks(req.device.genieacsDeviceId).catch(() => []);
  res.json({
    ...view.readiness(doc, summary),
    lastInform: summary.lastInform, interval: summary.online.interval,
    pendingTasks: tasks.map(t => ({ name: t.name, timestamp: t.timestamp })),
    profile: profile ? { verified: profile.verifiedOnRealDevice, parameterMap: profile.parameterMap, units: profile.units } : null
  });
});

router.get("/:id/capture", requireRole("noc", "admin"), async (req, res) => {
  const doc = await loadTree(req);
  const { summary } = await buildSummary(req, doc);
  const root = rootOf(doc);
  const parameters = root ? leaves(doc[root], root).map(([path, n]) => ({
    path, value: mask(path, n._value), type: n._type ?? null, writable: !!n._writable
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
    value: mask(path, n._value),
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

router.post("/:id/reboot", requireRole("noc", "admin"), once("reboot"), async (req, res) => {
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
  const [logs, notes, devEvents, faults] = await Promise.all([
    AuditLog.find({ device: req.device._id }).sort({ timestamp: -1 }).limit(100).populate("user", "name").lean(),
    DeviceNote.find({ device: req.device._id }).sort({ createdAt: -1 }).limit(100).populate("user", "name").lean(),
    DeviceEvent.find({ device: req.device._id }).sort({ at: -1 }).limit(200).lean(),
    genie.getFaults(req.device.genieacsDeviceId).catch(() => [])
  ]);
  const events = [
    ...logs.map(l => ({ type: "action", at: l.timestamp, action: l.action, result: l.result, user: l.user?.name, details: l.details, error: l.errorMessage })),
    ...notes.map(n => ({ type: "note", at: n.createdAt, user: n.user?.name, text: n.text })),
    ...faults.map(f => ({ type: "fault", at: f.timestamp, code: f.code, message: f.message, detail: f.detail?.faultString || null })),
    ...devEvents.map(e => ({ type: "event", at: e.at, event: e.type, details: e.details }))
  ];
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
