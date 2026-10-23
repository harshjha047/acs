const router = require("express").Router();
const crypto = require("node:crypto");
const { Transform, pipeline } = require("node:stream");
const { isValidObjectId } = require("mongoose");
const genie = require("../genieacsClient");
const Release = require("../models/FirmwareRelease");
const Rollout = require("../models/FirmwareRollout");
const Job = require("../models/FirmwareJob");
const Device = require("../models/Device");
const DeviceProfile = require("../models/DeviceProfile");
const fw = require("../lib/firmware");
const runner = require("../lib/firmwareRunner");
const { requireAuth, requirePerm } = require("../middleware/auth");

router.use(requireAuth, requirePerm("firmware.view"));
const admin = requirePerm("firmware.manage");
const deploy = requirePerm("firmware.deploy");
const err = (status, msg) => Object.assign(new Error(msg), { status });
const MAX_BYTES = () => Number(process.env.FIRMWARE_MAX_MB || 256) * 1048576;

async function load(Model, id, name) {
  if (!isValidObjectId(id)) throw err(400, `Invalid ${name} id`);
  const doc = await Model.findById(id);
  if (!doc) throw err(404, `${name} not found`);
  return doc;
}

router.get("/releases", async (req, res) => {
  const releases = await Release.find(req.query.status ? { status: String(req.query.status) } : {}).sort({ createdAt: -1 }).populate("uploadedBy approvedBy", "name").lean();
  const stats = await Job.aggregate([{ $group: { _id: { r: "$release", s: "$state" }, n: { $sum: 1 } } }]);
  const by = {};
  for (const s of stats) (by[s._id.r] ??= {})[s._id.s] = s.n;
  res.json(releases.map(r => ({ ...r, jobs: by[r._id] || {} })));
});

router.put("/releases/upload", admin, async (req, res) => {
  const data = fw.validateRelease(req.query);
  const length = Number(req.headers["content-length"]);
  if (!length) throw err(411, "Upload needs a Content-Length");
  if (length > MAX_BYTES()) throw err(413, `File larger than ${process.env.FIRMWARE_MAX_MB || 256} MB`);
  if (await Release.exists({ $or: [{ fileName: data.fileName }, { manufacturer: data.manufacturer, productClass: data.productClass, version: data.version }] })) {
    throw err(409, "A release with this file name or version already exists");
  }
  const oui = String(req.query.oui || "").trim()
    || (await DeviceProfile.findOne({ manufacturer: data.manufacturer, productClass: data.productClass }, "oui").lean())?.oui
    || (await Device.findOne({ manufacturer: data.manufacturer, productClass: data.productClass }, "oui").lean())?.oui || "";

  const hash = crypto.createHash("sha256");
  let size = 0;
  const meter = new Transform({
    transform(chunk, enc, cb) {
      size += chunk.length;
      if (size > length) return cb(err(413, "Body larger than Content-Length"));
      hash.update(chunk);
      cb(null, chunk);
    }
  });
  pipeline(req, meter, () => {});
  await genie.putFile(data.fileName, meter, { fileType: fw.FILE_TYPE, oui, productClass: data.productClass, version: data.version, length });
  const sha256 = hash.digest("hex");
  if (size !== length || (data.sha256 && data.sha256 !== sha256)) {
    await genie.deleteFile(data.fileName).catch(() => {});
    throw err(400, size !== length ? "Upload was cut short" : `sha256 mismatch: file is ${sha256}`);
  }
  const release = await Release.create({ ...data, oui, sha256, fileSize: size, uploadedBy: req.user.id });
  res.status(201).json(release);
});

router.patch("/releases/:id", admin, async (req, res) => {
  const release = await load(Release, req.params.id, "Release");
  const { status, releaseNotes } = req.body || {};
  if (releaseNotes !== undefined) release.releaseNotes = String(releaseNotes).trim().slice(0, 4000);
  if (status && status !== release.status) {
    if (!["draft", "approved", "retired"].includes(status)) throw err(400, "Invalid status");
    if (status === "approved" && !(await Job.exists({ release: release._id, rollout: null, state: "applied" }))) {
      throw err(409, "Push it to a bench device first (device page → Firmware). Approve after that upgrade shows Applied.");
    }
    if (status !== "approved" && (await Rollout.exists({ release: release._id, status: { $in: ["running", "paused"] } }))) {
      throw err(409, "Halt the rollouts using this release first");
    }
    Object.assign(release, { status }, status === "approved" && { approvedBy: req.user.id, approvedAt: new Date() });
  }
  await release.save();
  res.json(release);
});

router.delete("/releases/:id", admin, async (req, res) => {
  const release = await load(Release, req.params.id, "Release");
  if ((await Job.exists({ release: release._id })) || (await Rollout.exists({ release: release._id }))) throw err(409, "Release has jobs or rollouts. Retire it instead.");
  await genie.deleteFile(release.fileName);
  await release.deleteOne();
  res.json({ ok: true });
});

async function preview(body) {
  if (!isValidObjectId(body.releaseId)) throw err(400, "Pick a release");
  const release = await Release.findById(body.releaseId).lean();
  if (!release) throw err(404, "Release not found");
  const tmp = fw.validateRollout({ ...body, reason: body.reason || "preview" });
  const filter = fw.candidateFilter(release, tmp);
  const profile = await DeviceProfile.findOne({ manufacturer: release.manufacturer, productClass: release.productClass }, "supportsFirmwareUpgrade").lean();
  const [eligible, online, sample] = await Promise.all([
    Device.countDocuments(filter),
    Device.countDocuments({ ...filter, online: true }),
    Device.find(filter, "serialNumber softwareVersion online").limit(10).lean()
  ]);
  return { release, data: tmp, eligible, online, sample, profileEnabled: !!profile?.supportsFirmwareUpgrade };
}

router.post("/rollouts/preview", async (req, res) => {
  const { eligible, online, sample, profileEnabled, release } = await preview(req.body || {});
  res.json({ eligible, online, sample, profileEnabled, release: { status: release.status, version: release.version } });
});

router.post("/rollouts", deploy, async (req, res) => {
  const { release, data, eligible, profileEnabled } = await preview(req.body || {});
  if (release.status !== "approved") throw err(409, "Release must be approved");
  if (!profileEnabled) throw err(409, "Firmware upgrade is not enabled in this model's device profile");
  if (!eligible) throw err(409, "No eligible devices for this target");
  const rollout = await Rollout.create({ ...data, createdBy: req.user.id, history: [{ op: "create", by: req.user.id, at: new Date(), note: data.reason }] });
  res.status(201).json(rollout);
});

router.get("/rollouts", async (req, res) => {
  const rollouts = await Rollout.find().sort({ createdAt: -1 }).limit(100).populate("release", "manufacturer productClass version status").populate("createdBy", "name").lean();
  const stats = await Job.aggregate([{ $match: { rollout: { $in: rollouts.map(r => r._id) } } }, { $group: { _id: { r: "$rollout", w: "$wave", s: "$state" }, n: { $sum: 1 } } }]);
  const by = {};
  for (const { _id, n } of stats) {
    const r = (by[_id.r] ??= { total: {}, waves: {} });
    r.total[_id.s] = (r.total[_id.s] || 0) + n;
    (r.waves[_id.w] ??= {})[_id.s] = n;
  }
  res.json(rollouts.map(r => ({ ...r, jobs: by[r._id]?.total || {}, waveJobs: by[r._id]?.waves || {}, inWindow: fw.inWindow(r.window, new Date(), process.env.FIRMWARE_WINDOW_TZ || "Asia/Kolkata") })));
});

router.get("/rollouts/:id", async (req, res) => {
  const rollout = await load(Rollout, req.params.id, "Rollout");
  await rollout.populate([{ path: "release" }, { path: "history.by", select: "name" }]);
  const jobs = await Job.find({ rollout: rollout._id }).sort({ wave: 1, createdAt: 1 }).limit(2000)
    .populate({ path: "device", select: "serialNumber softwareVersion online customer", populate: { path: "customer", select: "name accountId" } }).lean();
  res.json({ ...rollout.toObject(), jobsList: jobs });
});

const OPS = {
  start: { from: ["draft"], set: r => ({ status: "running", startedAt: new Date() }) },
  pause: { from: ["running"], set: () => ({ status: "paused" }) },
  resume: { from: ["paused"], set: () => ({ status: "running" }) },
  promote: { from: ["paused"], set: r => ({ status: "running", currentWave: r.currentWave + 1 }) }
};

router.post("/rollouts/:id/:op", deploy, async (req, res) => {
  const rollout = await load(Rollout, req.params.id, "Rollout");
  const note = String(req.body?.note || "").trim().slice(0, 500) || undefined;
  if (req.params.op === "halt") {
    if (!note) throw err(400, "Reason is required to halt");
    if (!(await runner.halt(rollout, { by: req.user.id, note }))) throw err(409, `Cannot halt a ${rollout.status} rollout`);
    return res.json(await Rollout.findById(rollout._id).lean());
  }
  const op = OPS[req.params.op];
  if (!op) throw err(404, "Unknown action");
  if (!op.from.includes(rollout.status)) throw err(409, `Cannot ${req.params.op} a ${rollout.status} rollout`);
  if (req.params.op === "promote" && rollout.currentWave >= rollout.waves.length - 1) throw err(409, "Already on the last wave");
  if (["start", "resume", "promote"].includes(req.params.op)) {
    const release = await Release.findById(rollout.release, "status").lean();
    if (release?.status !== "approved") throw err(409, "Release is not approved");
  }
  const updated = await Rollout.findOneAndUpdate(
    { _id: rollout._id, status: rollout.status },
    { $set: op.set(rollout), $push: { history: { op: req.params.op, by: req.user.id, at: new Date(), note } } },
    { new: true }
  ).lean();
  if (!updated) throw err(409, "Rollout changed; reload");
  res.json(updated);
});

module.exports = router;
