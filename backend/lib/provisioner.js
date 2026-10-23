const genie = require("../genieacsClient");
const Device = require("../models/Device");
const Customer = require("../models/Customer");
const PreRegistration = require("../models/PreRegistration");
const Template = require("../models/ProvisioningTemplate");
const AuditLog = require("../models/AuditLog");
const p = require("./provisioning");

const BATCH = 20;
const WAIT_MS = 6 * 3600 * 1000;
const QUEUE_MS = 24 * 3600 * 1000;
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const conflict = msg => Object.assign(new Error(msg), { status: 409 });

async function request(device, { template, preRegistration = null, user, overrides = {} }) {
  if (["pending", "queued"].includes(device.provisioning?.state)) throw conflict("Provisioning is already in progress for this device");
  const tpl = template?._id ? template : await Template.findById(template).lean();
  if (!tpl || tpl.isActive === false) throw Object.assign(new Error("Template not found or inactive"), { status: 400 });
  const o = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v));
  if (tpl.wifi?.password === "generate" && !o.password) o.password = p.generatePassword();
  const provisioning = { template: tpl._id, preRegistration, requestedBy: user, state: "pending", overrides: o, requestedAt: new Date() };
  const res = await Device.updateOne(
    { _id: device._id, "provisioning.state": { $nin: ["pending", "queued"] } },
    { $set: { provisioning }, ...(tpl.tags?.length && { $addToSet: { tags: { $each: tpl.tags } } }) }
  );
  if (!res.matchedCount) throw conflict("Provisioning is already in progress for this device");
  return provisioning;
}

async function finish(device, state, { error = null, changes } = {}) {
  const set = { "provisioning.state": state, "provisioning.finishedAt": new Date(), "provisioning.error": error };
  if (changes) set["provisioning.changes"] = changes;
  await Device.updateOne({ _id: device._id }, { $set: set });
  if (device.provisioning?.auditId) {
    await AuditLog.updateOne({ _id: device.provisioning.auditId }, { $set: { result: state === "applied" ? "success" : "failed", ...(error && { errorMessage: error }) } });
  }
}

async function contextOf(device) {
  const customer = device.customer ? await Customer.findById(device.customer, "accountId phone name").lean() : null;
  return { serialNumber: device.serialNumber, macAddress: device.macAddress, customer };
}

async function claim(device) {
  const now = new Date();
  const res = await Device.updateOne(
    { _id: device._id, "provisioning.state": "pending", $or: [{ "provisioning.claimedAt": null }, { "provisioning.claimedAt": { $lt: new Date(now - 120000) } }] },
    { $set: { "provisioning.claimedAt": now } }
  );
  return res.modifiedCount === 1;
}

async function processOne(device, { connectionRequest = false } = {}) {
  if (!(await claim(device))) return null;
  const prov = device.provisioning;
  const template = await Template.findById(prov.template).lean();
  if (!template) return finish(device, "failed", { error: "Template was deleted" });
  const doc = await genie.getDevice(device.genieacsDeviceId);
  if (!doc) return finish(device, "failed", { error: "Device not found in GenieACS" });

  let plan;
  try {
    plan = p.plan(doc, template, { overrides: prov.overrides || {}, ctx: await contextOf(device) });
  } catch (err) {
    return finish(device, "failed", { error: err.message });
  }
  if (plan.waiting) {
    if (Date.now() - new Date(prov.requestedAt) > WAIT_MS) return finish(device, "failed", { error: `${plan.waiting} after 6 h` });
    await Device.updateOne({ _id: device._id }, { $set: { "provisioning.claimedAt": null } });
    return null;
  }
  const error = plan.skipped.length ? `Skipped: ${plan.skipped.join("; ")}` : null;
  if (!plan.values.length) return finish(device, "applied", { error, changes: ["No parameter changes"] });

  const log = await AuditLog.create({
    user: prov.requestedBy, device: device._id, action: "auto_provision",
    details: { template: template.name, templateId: template._id, preRegistration: prov.preRegistration, changes: plan.changes, skipped: plan.skipped }
  });
  device.provisioning.auditId = log._id;
  try {
    const { outcome, task } = await genie.queueTask(
      device.genieacsDeviceId,
      { name: "setParameterValues", parameterValues: plan.values },
      { connectionRequest, timeout: 8000 }
    );
    await AuditLog.updateOne({ _id: log._id }, { $set: { "details.outcome": outcome, "details.taskId": task?._id } });
    await Device.updateOne({ _id: device._id }, {
      $set: { "provisioning.auditId": log._id, "provisioning.taskId": task?._id, "provisioning.changes": plan.changes, "provisioning.error": error }
    });
    if (outcome === "success") return finish(device, "applied", { error, changes: plan.changes });
    await Device.updateOne({ _id: device._id }, { $set: { "provisioning.state": "queued", "provisioning.queuedAt": new Date() } });
    return "queued";
  } catch (err) {
    return finish(device, "failed", { error: err.message, changes: plan.changes });
  }
}

async function checkQueued(device) {
  const { taskId, queuedAt } = device.provisioning;
  const id = device.genieacsDeviceId;
  const [tasks, faults] = await Promise.all([genie.getTasks(id), genie.getFaults(id)]);
  const fault = faults.find(f => f._id === `${id}:task_${taskId}`);
  if (fault) return finish(device, "failed", { error: `Device fault ${fault.code}: ${fault.detail?.faultString || fault.message}` });
  if (!tasks.some(t => String(t._id) === String(taskId))) return finish(device, "applied", { error: device.provisioning.error });
  if (Date.now() - new Date(queuedAt) > QUEUE_MS) return finish(device, "failed", { error: "Not executed within 24 h (device did not check in)" });
  return null;
}

async function matchPreRegistrations() {
  const waiting = await PreRegistration.find({ status: "waiting" }).select("+wifiPassword").lean();
  let matched = 0;
  for (const pre of waiting) {
    const or = [
      ...(pre.serialNumber ? [{ serialNumber: new RegExp(`^${escapeRe(pre.serialNumber)}$`, "i") }] : []),
      ...(pre.macAddress ? [{ macAddress: pre.macAddress }] : [])
    ];
    if (!or.length) continue;
    const device = await Device.findOne({ removedAt: null, $or: or });
    if (!device) continue;
    const claimed = await PreRegistration.updateOne({ _id: pre._id, status: "waiting" }, { $set: { status: "matched", device: device._id, matchedAt: new Date() } });
    if (!claimed.modifiedCount) continue;
    matched++;
    const set = {};
    if (pre.customer && String(device.customer) !== String(pre.customer)) set.customer = pre.customer;
    await Device.updateOne({ _id: device._id }, { ...(Object.keys(set).length && { $set: set }), ...(pre.tags?.length && { $addToSet: { tags: { $each: pre.tags } } }) });
    if (set.customer) {
      await AuditLog.create({ user: pre.createdBy, device: device._id, action: "customer_link", result: "success", details: { from: device.customer, to: pre.customer, preRegistration: pre._id } });
    }
    if (pre.template) {
      await request(device, {
        template: pre.template, preRegistration: pre._id, user: pre.createdBy,
        overrides: { ssid: pre.ssid, ssid5: pre.ssid5, password: pre.wifiPassword }
      }).catch(err => console.error("provisioner: pre-registration", pre._id, err.message));
    }
  }
  return matched;
}

async function autoApply() {
  const templates = await Template.find({ isActive: true, autoApplyToNew: true, armedAt: { $ne: null } }).lean();
  if (!templates.length) return 0;
  const since = new Date(Math.min(...templates.map(t => new Date(t.armedAt))));
  const devices = await Device.find({ removedAt: null, "provisioning.state": null, firstSeenAt: { $gte: since } }).limit(BATCH);
  let n = 0;
  for (const device of devices) {
    const tpl = p.matchTemplate(templates.filter(t => new Date(t.armedAt) <= device.firstSeenAt), device);
    if (!tpl) continue;
    await request(device, { template: tpl, user: tpl.createdBy }).then(() => n++, () => {});
  }
  return n;
}

async function step(name, fn) {
  try {
    return await fn();
  } catch (err) {
    console.error(`provisioner ${name}:`, err.message);
    return null;
  }
}

async function tick() {
  const matched = await step("match", matchPreRegistrations);
  const auto = await step("auto", autoApply);
  let processed = 0, checked = 0;
  await step("pending", async () => {
    for (const d of await Device.find({ "provisioning.state": "pending", removedAt: null }).select("+provisioning.overrides").sort({ "provisioning.requestedAt": 1 }).limit(BATCH)) {
      if (await step("process", () => processOne(d))) processed++;
    }
  });
  await step("queued", async () => {
    for (const d of await Device.find({ "provisioning.state": "queued" }).sort({ "provisioning.queuedAt": 1 }).limit(BATCH * 5)) {
      await step("check", () => checkQueued(d));
      checked++;
    }
  });
  return { matched, auto, processed, checked };
}

module.exports = { request, processOne, checkQueued, matchPreRegistrations, autoApply, tick };
