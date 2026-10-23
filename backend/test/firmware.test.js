const test = require("node:test");
const assert = require("node:assert/strict");
const fw = require("../lib/firmware");

const release = { manufacturer: "Realtek", productClass: "DG-GR6821AC", version: "V3.3.00", status: "approved", fromVersions: [], hardwareVersions: [] };
const device = { manufacturer: "Realtek", productClass: "DG-GR6821AC", softwareVersion: "V3.2.02-221128" };
const profile = { supportsFirmwareUpgrade: true };
const t0 = new Date("2026-10-23T20:00:00Z");
const at = min => new Date(+t0 + min * 60e3);

test("validateRelease: required fields, sha, from != target, lists", () => {
  assert.throws(() => fw.validateRelease({ manufacturer: "R", productClass: "C", version: "", fileName: "a.bin" }), /Version/);
  assert.throws(() => fw.validateRelease({ manufacturer: "R", productClass: "C", version: "1", fileName: "../x" }), /File name/);
  assert.throws(() => fw.validateRelease({ manufacturer: "R", productClass: "C", version: "1", fileName: "a.bin", sha256: "abc" }), /sha256/);
  assert.throws(() => fw.validateRelease({ manufacturer: "R", productClass: "C", version: "1", fileName: "a.bin", fromVersions: "0.9, 1" }), /From-versions/);
  const r = fw.validateRelease({ manufacturer: " R ", productClass: "C", version: "1.1", fileName: "a.bin", hardwareVersions: "V4.1, V4.1 ,V4.2", sha256: "A".repeat(64) });
  assert.deepEqual(r.hardwareVersions, ["V4.1", "V4.2"]);
  assert.equal(r.sha256, "a".repeat(64));
});

test("validateRollout: waves, 0 only last, window, reason", () => {
  assert.throws(() => fw.validateRollout({ waves: "5,50" }), /Reason/);
  assert.throws(() => fw.validateRollout({ waves: "5,0,50", reason: "x" }), /last wave/);
  assert.throws(() => fw.validateRollout({ waves: "5,-1", reason: "x" }), /Waves/);
  assert.throws(() => fw.validateRollout({ reason: "x", window: { start: "25:00", end: "05:00" } }), /HH:MM/);
  const r = fw.validateRollout({ reason: "x", tags: "Canary", maxFailPct: "" });
  assert.deepEqual(r.waves, [5, 50, 500, 0]);
  assert.deepEqual(r.target.tags, ["canary"]);
  assert.equal(r.maxFailPct, 5);
});

test("eligibility: model, profile, same version, from-versions, hardware, provisioning", () => {
  assert.equal(fw.eligibility(device, release, { profile }).ok, true);
  assert.match(fw.eligibility(device, release, { profile: {} }).reason, /not enabled/);
  assert.match(fw.eligibility({ ...device, productClass: "X" }, release, { profile }).reason, /Different model/);
  assert.match(fw.eligibility({ ...device, softwareVersion: "v3.3.00" }, release, { profile }).reason, /Already/);
  assert.match(fw.eligibility(device, { ...release, fromVersions: ["V3.1"] }, { profile }).reason, /upgrade source/);
  assert.match(fw.eligibility(device, { ...release, hardwareVersions: ["V5"] }, { profile, hardwareVersion: "V4.1" }).reason, /Hardware V4.1/);
  assert.match(fw.eligibility(device, { ...release, hardwareVersions: ["V5"] }, { profile, hardwareVersion: null }).reason, /unknown/);
  assert.equal(fw.eligibility(device, { ...release, hardwareVersions: ["V5"] }, { profile }).ok, true);
  assert.match(fw.eligibility({ ...device, provisioning: { state: "queued" } }, release, { profile }).reason, /Provisioning/);
});

test("nextJobState: sent → downloading → rebooting → applied", () => {
  const job = { state: "sent", sentAt: t0, toVersion: "V3.3.00" };
  const online = { softwareVersion: "V3.2.02", online: true, lastInformAt: at(3), lastBootAt: at(-600) };
  assert.equal(fw.nextJobState(job, { device: online, taskPending: true, now: at(2) }), null);
  const dl = fw.nextJobState(job, { device: online, taskPending: false, now: at(4) });
  assert.equal(dl.state, "downloading");
  assert.equal(+dl.executedAt, +at(3));
  const j2 = { ...job, ...dl };
  assert.equal(fw.nextJobState(j2, { device: { ...online, online: false }, now: at(8) }).state, "rebooting");
  assert.equal(fw.nextJobState({ ...j2, state: "rebooting" }, { device: { ...online, softwareVersion: "V3.3.00", lastBootAt: at(9) }, now: at(10) }).state, "applied");
});

test("nextJobState: failures (fault, booted on old version, timeouts)", () => {
  const job = { state: "downloading", sentAt: t0, executedAt: at(3), toVersion: "V3.3.00" };
  const dev = { softwareVersion: "V3.2.02", online: true, lastBootAt: at(-600) };
  assert.match(fw.nextJobState(job, { device: dev, fault: { code: "cwmp.9010", detail: { faultString: "Download failed" } }, now: at(5) }).error, /9010: Download failed/);
  assert.match(fw.nextJobState(job, { device: { ...dev, lastBootAt: at(7) }, now: at(9) }).error, /Rebooted on V3.2.02/);
  assert.match(fw.nextJobState(job, { device: dev, now: at(70) }).error, /No upgrade within 60 min/);
  assert.equal(fw.nextJobState(job, { device: dev, now: at(30) }), null);
  assert.match(fw.nextJobState({ ...job, state: "sent", executedAt: null }, { device: dev, taskPending: true, now: at(25 * 60) }).error, /did not check in/);
  assert.equal(fw.nextJobState({ ...job, state: "applied" }, { device: dev, now: at(1) }), null);
});

test("halt rule and wave size", () => {
  assert.equal(fw.shouldHalt({ applied: 4, failed: 1 }, 5), true);
  assert.equal(fw.shouldHalt({ applied: 99, failed: 1 }, 5), false);
  assert.equal(fw.shouldHalt({ applied: 10, failed: 0 }, 0), false);
  assert.equal(fw.waveSize({ waves: [5, 0], currentWave: 1 }), Infinity);
  assert.equal(fw.waveSize({ waves: [5, 0], currentWave: 0 }), 5);
  assert.deepEqual(fw.counts([{ state: "applied", n: 3 }, { state: "failed" }]).applied, 3);
});

test("inWindow: IST, overnight wrap, always-on", () => {
  const ist = (h, m) => new Date(Date.UTC(2026, 9, 23, h, m) - 330 * 60e3);
  assert.equal(fw.inWindow({ start: "01:00", end: "05:00" }, ist(2, 0)), true);
  assert.equal(fw.inWindow({ start: "01:00", end: "05:00" }, ist(5, 0)), false);
  assert.equal(fw.inWindow({ start: "23:00", end: "04:00" }, ist(23, 30)), true);
  assert.equal(fw.inWindow({ start: "23:00", end: "04:00" }, ist(12, 0)), false);
  assert.equal(fw.inWindow({ start: "00:00", end: "00:00" }, ist(12, 0)), true);
});

test("candidateFilter: rollout from-versions override, tags, excludes", () => {
  const f = fw.candidateFilter({ ...release, fromVersions: ["A"] }, { target: { tags: ["canary"], fromVersions: ["B"] } }, ["x"]);
  assert.deepEqual(f.softwareVersion, { $in: ["B"] });
  assert.deepEqual(f.tags, { $all: ["canary"] });
  assert.deepEqual(f._id, { $nin: ["x"] });
  assert.deepEqual(fw.candidateFilter(release, { target: {} }).softwareVersion, { $nin: [null, "", "V3.3.00"] });
});
