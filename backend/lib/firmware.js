const ACTIVE = ["queued", "sent", "downloading", "rebooting"];
const TERMINAL = ["applied", "failed", "skipped"];
const FILE_TYPE = "1 Firmware Upgrade Image";
const SHA_RE = /^[a-f0-9]{64}$/;
const VERSION_RE = /^[\x21-\x7e][\x20-\x7e]{0,63}$/;
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const bad = msg => Object.assign(new Error(msg), { status: 400 });
const norm = v => String(v ?? "").trim().toLowerCase();
const list = v => [...new Set((Array.isArray(v) ? v : String(v || "").split(",")).map(s => String(s).trim()).filter(Boolean))];

function validateRelease(q) {
  const r = {
    manufacturer: String(q.manufacturer || "").trim(),
    productClass: String(q.productClass || "").trim(),
    version: String(q.version || "").trim(),
    fileName: String(q.fileName || "").trim(),
    sha256: q.sha256 ? String(q.sha256).trim().toLowerCase() : null,
    hardwareVersions: list(q.hardwareVersions),
    fromVersions: list(q.fromVersions),
    releaseNotes: String(q.releaseNotes || "").trim().slice(0, 4000) || undefined
  };
  if (!r.manufacturer || !r.productClass) throw bad("Manufacturer and product class are required");
  if (!VERSION_RE.test(r.version)) throw bad("Version must be 1-64 printable characters, exactly as the device reports SoftwareVersion");
  if (!FILE_RE.test(r.fileName)) throw bad("File name: letters, digits, dot, dash, underscore (max 128)");
  if (r.sha256 && !SHA_RE.test(r.sha256)) throw bad("sha256 must be 64 hex characters");
  if (r.fromVersions.some(v => norm(v) === norm(r.version))) throw bad("From-versions must not include the target version");
  return r;
}

function validateRollout(body) {
  const waves = list(body.waves).map(Number);
  const r = {
    release: body.releaseId,
    target: { tags: list(body.tags).map(t => t.toLowerCase()), fromVersions: list(body.fromVersions) },
    waves: waves.length ? waves : [5, 50, 500, 0],
    maxFailPct: body.maxFailPct === undefined || body.maxFailPct === "" ? 5 : Number(body.maxFailPct),
    window: { start: String(body.window?.start || "01:00"), end: String(body.window?.end || "05:00") },
    reason: String(body.reason || "").trim().slice(0, 500),
    note: String(body.note || "").trim().slice(0, 500) || undefined
  };
  if (!r.reason) throw bad("Reason is required");
  if (!r.waves.length || r.waves.length > 10 || r.waves.some(n => !Number.isInteger(n) || n < 0 || n > 100000)) throw bad("Waves: up to 10 whole numbers, 0 = all remaining");
  if (r.waves.slice(0, -1).includes(0)) throw bad("0 (all remaining) can only be the last wave");
  if (!Number.isFinite(r.maxFailPct) || r.maxFailPct < 0 || r.maxFailPct > 100) throw bad("Max failure % must be 0-100");
  if (!TIME_RE.test(r.window.start) || !TIME_RE.test(r.window.end)) throw bad("Window times must be HH:MM");
  return r;
}

function eligibility(device, release, { profile, hardwareVersion } = {}) {
  const no = reason => ({ ok: false, reason });
  if (device.removedAt) return no("Removed from ACS");
  if (device.manufacturer !== release.manufacturer || device.productClass !== release.productClass) return no(`Different model (${release.manufacturer} ${release.productClass})`);
  if (!profile?.supportsFirmwareUpgrade) return no("Firmware upgrade is not enabled in the device profile");
  if (release.status === "retired") return no("Release is retired");
  if (!device.softwareVersion) return no("Current version unknown");
  if (norm(device.softwareVersion) === norm(release.version)) return no(`Already on ${release.version}`);
  if (release.fromVersions?.length && !release.fromVersions.some(v => norm(v) === norm(device.softwareVersion))) return no(`Version ${device.softwareVersion} is not an allowed upgrade source`);
  if (release.hardwareVersions?.length && hardwareVersion !== undefined) {
    if (!hardwareVersion) return no("Hardware version unknown");
    if (!release.hardwareVersions.some(v => norm(v) === norm(hardwareVersion))) return no(`Hardware ${hardwareVersion} is not supported by this release`);
  }
  if (["pending", "queued"].includes(device.provisioning?.state)) return no("Provisioning in progress");
  return { ok: true };
}

function nextJobState(job, { device, taskPending, fault, now = new Date(), applyTimeoutMs = 3600e3, pickupTimeoutMs = 24 * 3600e3 }) {
  const fail = error => ({ state: "failed", error, finishedAt: now });
  if (!ACTIVE.includes(job.state) || job.state === "queued") return null;
  if (fault) return fail(`Device fault ${fault.code}: ${fault.detail?.faultString || fault.message || ""}`.trim());
  if (!device || device.removedAt) return fail("Device removed from ACS");
  if (norm(device.softwareVersion) === norm(job.toVersion)) return { state: "applied", finishedAt: now };
  if (job.state === "sent") {
    if (taskPending) return now - new Date(job.sentAt) > pickupTimeoutMs ? fail(`Not picked up within ${Math.round(pickupTimeoutMs / 3600e3)} h (device did not check in)`) : null;
    return { state: "downloading", executedAt: device.lastInformAt ? new Date(Math.max(+new Date(device.lastInformAt), +new Date(job.sentAt))) : now };
  }
  const since = new Date(job.executedAt || job.sentAt);
  if (device.lastBootAt && new Date(device.lastBootAt) > since && device.online) {
    return fail(`Rebooted on ${device.softwareVersion || "unknown"}; expected ${job.toVersion}`);
  }
  if (now - since > applyTimeoutMs) return fail(`No upgrade within ${Math.round(applyTimeoutMs / 60e3)} min`);
  if (job.state === "downloading" && device.online === false) return { state: "rebooting" };
  if (job.state === "rebooting" && device.online) return { state: "downloading" };
  return null;
}

function counts(jobs) {
  const c = Object.fromEntries([...ACTIVE, ...TERMINAL].map(s => [s, 0]));
  for (const j of jobs) c[j.state] = (c[j.state] || 0) + (j.n ?? 1);
  return c;
}

const failPct = ({ applied = 0, failed = 0 }) => (applied + failed ? (failed * 100) / (applied + failed) : 0);
const shouldHalt = (c, maxFailPct) => c.failed > 0 && failPct(c) > maxFailPct;
const waveSize = r => (r.waves[r.currentWave] === 0 ? Infinity : r.waves[r.currentWave] ?? 0);

function minutesIn(date, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map(p => [p.type, p.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function inWindow(window, now = new Date(), tz = "Asia/Kolkata") {
  const toMin = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const [a, b, m] = [toMin(window.start), toMin(window.end), minutesIn(now, tz)];
  if (a === b) return true;
  return a < b ? m >= a && m < b : m >= a || m < b;
}

function candidateFilter(release, rollout, exclude = []) {
  const f = { manufacturer: release.manufacturer, productClass: release.productClass, removedAt: null, softwareVersion: { $nin: [null, "", release.version] } };
  const from = rollout.target?.fromVersions?.length ? rollout.target.fromVersions : release.fromVersions;
  if (from?.length) f.softwareVersion = { $in: from };
  if (rollout.target?.tags?.length) f.tags = { $all: rollout.target.tags };
  if (exclude.length) f._id = { $nin: exclude };
  f["provisioning.state"] = { $nin: ["pending", "queued"] };
  return f;
}

module.exports = { ACTIVE, TERMINAL, FILE_TYPE, SHA_RE, validateRelease, validateRollout, eligibility, nextJobState, counts, failPct, shouldHalt, waveSize, inWindow, candidateFilter, norm };
