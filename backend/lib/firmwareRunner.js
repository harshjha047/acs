const genie = require("../genieacsClient");
const Device = require("../models/Device");
const DeviceProfile = require("../models/DeviceProfile");
const AuditLog = require("../models/AuditLog");
const Release = require("../models/FirmwareRelease");
const Rollout = require("../models/FirmwareRollout");
const Job = require("../models/FirmwareJob");
const fw = require("./firmware");

const env = (k, d) => Number(process.env[k] || d);
const TZ = () => process.env.FIRMWARE_WINDOW_TZ || "Asia/Kolkata";
const MAX_SEND = () => env("FIRMWARE_MAX_SEND", 20);
const APPLY_MS = () => env("FIRMWARE_APPLY_TIMEOUT_MIN", 60) * 60e3;
const PICKUP_MS = () => env("FIRMWARE_PICKUP_TIMEOUT_H", 24) * 3600e3;
const RESET_TIMEOUT_MS = 6 * 3600e3;
const HW_PATHS = ["InternetGatewayDevice.DeviceInfo.HardwareVersion", "Device.DeviceInfo.HardwareVersion"];

const profileOf = d => DeviceProfile.findOne({ manufacturer: d.manufacturer, productClass: d.productClass }).lean();

async function hardwareVersion(device) {
  const doc = await genie.getDevice(device.genieacsDeviceId, HW_PATHS).catch(() => null);
  for (const p of HW_PATHS) {
    const v = p.split(".").reduce((n, k) => n?.[k], doc)?._value;
    if (v) return String(v);
  }
  return null;
}

async function finishJob(job, patch) {
  await Job.updateOne({ _id: job._id }, { $set: patch });
  if (job.auditId && ["applied", "failed", "skipped"].includes(patch.state)) {
    await AuditLog.updateOne({ _id: job.auditId }, {
      $set: { result: patch.state === "applied" ? "success" : "failed", "details.state": patch.state, ...(patch.error && { errorMessage: patch.error }) }
    });
  }
}

async function send(job, release, { connectionRequest = false, user } = {}) {
  const device = await Device.findById(job.device).lean();
  const check = fw.eligibility(device || { removedAt: true }, release, { profile: device && (await profileOf(device)), hardwareVersion: device && (await hardwareVersion(device)) });
  if (!check.ok) {
    await finishJob(job, { state: "skipped", error: check.reason, finishedAt: new Date() });
    return { state: "skipped", error: check.reason };
  }
  const log = await AuditLog.create({
    user: user || job.requestedBy, device: device._id, action: "firmware_push",
    details: { release: release._id, fileName: release.fileName, from: device.softwareVersion, to: release.version, rollout: job.rollout || undefined, wave: job.wave ?? undefined, reason: job.reason }
  });
  const base = { auditId: log._id, fromVersion: device.softwareVersion, toVersion: release.version, sentAt: new Date() };
  try {
    const { outcome, task } = await genie.download(device.genieacsDeviceId, release.fileName, fw.FILE_TYPE, { connectionRequest, timeout: 8000 });
    const patch = { ...base, taskId: task?._id, state: outcome === "success" ? "downloading" : "sent", ...(outcome === "success" && { executedAt: new Date() }) };
    await Job.updateOne({ _id: job._id }, { $set: patch });
    await AuditLog.updateOne({ _id: log._id }, { $set: { "details.taskId": task?._id, "details.outcome": outcome } });
    return patch;
  } catch (err) {
    await finishJob({ ...job, auditId: log._id }, { ...base, state: "failed", error: err.message, finishedAt: new Date() });
    return { state: "failed", error: err.message };
  }
}

async function check(job, now) {
  const device = await Device.findById(job.device, "softwareVersion lastBootAt lastInformAt online removedAt genieacsDeviceId").lean();
  let taskPending = false, fault = null;
  if (device && job.taskId) {
    const id = device.genieacsDeviceId;
    const [tasks, faults] = await Promise.all([
      job.state === "sent" ? genie.getTasks(id) : [],
      genie.getFaults(id).catch(() => [])
    ]);
    taskPending = tasks.some(t => String(t._id) === String(job.taskId));
    fault = faults.find(f => f._id === `${id}:task_${job.taskId}`) || null;
  }
  const next = fw.nextJobState(job, { device, taskPending, fault, now, applyTimeoutMs: APPLY_MS(), pickupTimeoutMs: PICKUP_MS() });
  if (!next) return null;
  if (fw.TERMINAL.includes(next.state)) await finishJob(job, next);
  else await Job.updateOne({ _id: job._id }, { $set: next });
  return next.state;
}

async function rolloutCounts(rolloutId, wave) {
  const match = { rollout: rolloutId, ...(wave !== undefined && { wave }) };
  return fw.counts(await Job.aggregate([{ $match: match }, { $group: { _id: "$state", n: { $sum: 1 } } }, { $project: { state: "$_id", n: 1 } }]));
}

async function halt(rollout, { by = null, note }) {
  const now = new Date();
  const res = await Rollout.updateOne({ _id: rollout._id, status: { $in: ["running", "paused", "draft"] } }, {
    $set: { status: "halted", finishedAt: now }, $push: { history: { op: "halt", by, at: now, note } }
  });
  if (!res.modifiedCount) return false;
  for (const job of await Job.find({ rollout: rollout._id, state: { $in: ["queued", "sent"] } }).lean()) {
    const cancelled = job.taskId ? await genie.deleteTask(job.taskId).catch(() => false) : true;
    if (cancelled) await finishJob(job, { state: "skipped", error: "Rollout halted", finishedAt: now });
  }
  return true;
}

async function advance(rollout, now) {
  const release = await Release.findById(rollout.release).lean();
  if (!release || release.status !== "approved") return halt(rollout, { note: "Release is no longer approved" });
  const all = await rolloutCounts(rollout._id);
  if (fw.shouldHalt(all, rollout.maxFailPct)) {
    return halt(rollout, { note: `Failure rate ${fw.failPct(all).toFixed(1)}% > ${rollout.maxFailPct}% (${all.failed} failed, ${all.applied} applied)` });
  }

  const wave = await rolloutCounts(rollout._id, rollout.currentWave);
  const used = fw.ACTIVE.reduce((n, s) => n + wave[s], 0) + wave.applied + wave.failed;
  let need = fw.waveSize(rollout) - used;
  const done = await Job.distinct("device", { rollout: rollout._id });
  const busy = await Job.distinct("device", { state: { $in: fw.ACTIVE } });
  const filter = fw.candidateFilter(release, rollout, [...done, ...busy]);

  if (need > 0 && fw.inWindow(rollout.window, now, TZ())) {
    const devices = await Device.find({ ...filter, online: true }, "_id").sort({ lastInformAt: -1 }).limit(Math.min(need, MAX_SEND())).lean();
    for (const d of devices) {
      const job = await Job.create({ rollout: rollout._id, release: release._id, device: d._id, wave: rollout.currentWave, requestedBy: rollout.createdBy })
        .catch(err => (err.code === 11000 ? null : Promise.reject(err)));
      if (!job) continue;
      const r = await send({ ...job.toObject(), reason: rollout.reason }, release, { user: rollout.createdBy });
      if (r.state !== "skipped") need--;
    }
  }

  if (await Job.exists({ rollout: rollout._id, wave: rollout.currentWave, state: { $in: fw.ACTIVE } })) return null;
  const remaining = await Device.countDocuments(fw.candidateFilter(release, rollout, await Job.distinct("device", { rollout: rollout._id })));
  const last = rollout.currentWave >= rollout.waves.length - 1;
  if (!remaining || (last && need <= 0)) {
    await Rollout.updateOne({ _id: rollout._id, status: "running" }, { $set: { status: "done", finishedAt: now }, $push: { history: { op: "done", at: now, note: remaining ? `${remaining} devices not covered by waves` : "No eligible devices left" } } });
    return "done";
  }
  if (need <= 0) {
    await Rollout.updateOne({ _id: rollout._id, status: "running" }, { $set: { status: "paused" }, $push: { history: { op: "wave_done", at: now, note: `Wave ${rollout.currentWave + 1} complete. Review, then promote.` } } });
    return "paused";
  }
  return null;
}

async function closeFactoryResets(now) {
  const pending = await AuditLog.find({ action: "factory_reset", result: "pending" }).lean();
  for (const log of pending) {
    const device = await Device.findById(log.device).select("+provisioning.overrides").lean();
    if (device?.lastBootAt && device.lastBootAt > log.timestamp && device.online) {
      const downtimeSec = Math.max(0, Math.round((device.lastBootAt - Math.max(+log.timestamp, +new Date(log.details?.executedAt || 0))) / 1000));
      let reprovision = null;
      if (log.details?.reprovision && device.provisioning?.template) {
        const provisioner = require("./provisioner");
        reprovision = await provisioner.request(device, {
          template: device.provisioning.template, preRegistration: device.provisioning.preRegistration, user: log.user, overrides: device.provisioning.overrides || {}
        }).then(() => "requested", err => `skipped: ${err.message}`);
      }
      await AuditLog.updateOne({ _id: log._id }, { $set: { result: "success", "details.completedAt": device.lastBootAt, "details.downtimeSec": downtimeSec, ...(reprovision && { "details.reprovisionResult": reprovision }) } });
    } else if (now - log.timestamp > RESET_TIMEOUT_MS) {
      await AuditLog.updateOne({ _id: log._id }, { $set: { result: "failed", errorMessage: "Device did not come back within 6 h (check OLT re-push of the ACS URL)" } });
    }
  }
}

async function firmwareTick(now = new Date()) {
  const out = { checked: 0, rollouts: 0, errors: 0 };
  const guard = async fn => fn().catch(err => { out.errors++; console.error("firmware:", err.message); });
  await guard(async () => {
    for (const job of await Job.find({ state: { $in: ["sent", "downloading", "rebooting"] } }).sort({ sentAt: 1 }).limit(500).lean()) {
      await guard(() => check(job, now));
      out.checked++;
    }
  });
  await guard(async () => {
    for (const r of await Rollout.find({ status: "running" }).lean()) {
      await guard(() => advance(r, now));
      out.rollouts++;
    }
  });
  await guard(() => closeFactoryResets(now));
  return out;
}

module.exports = { tick: firmwareTick, send, check, advance, halt, rolloutCounts, hardwareVersion, profileOf };
