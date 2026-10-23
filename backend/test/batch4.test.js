const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const diag = require("../lib/diagnostics");
const view = require("../lib/deviceView");
const { capabilities } = require("../lib/capabilities");
const health = require("../lib/health");
const { buildTree } = require("./helpers");

const IGD = "InternetGatewayDevice";
const T = `${IGD}.TraceRouteDiagnostics`;
const U = `${IGD}.UploadDiagnostics`;

const igd = (extra = {}) => buildTree({
  [`${IGD}.DeviceInfo.UpTime`]: 100,
  [`${IGD}.ManagementServer.ConnectionRequestURL`]: "http://10.115.0.10:7547/tr69",
  [`${IGD}.IPPingDiagnostics.DiagnosticsState`]: "None",
  [`${T}.DiagnosticsState`]: "Complete",
  [`${T}.Host`]: "8.8.8.8",
  [`${T}.ResponseTime`]: 31,
  [`${T}.RouteHopsNumberOfEntries`]: 2,
  [`${T}.RouteHops.2.HopHost`]: "8.8.8.8",
  [`${T}.RouteHops.2.HopRTTimes`]: "12.552,12.362,1",
  [`${T}.RouteHops.1.HopHost`]: "10.115.0.1",
  [`${T}.RouteHops.1.HopHostAddress`]: "10.115.0.1",
  [`${T}.RouteHops.1.HopRTTimes`]: "2,3,4",
  [`${T}.RouteHops.1.HopErrorCode`]: 0,
  [`${U}.DiagnosticsState`]: "Completed",
  [`${U}.TestFileLength`]: 10000000,
  [`${U}.BOMTime`]: "2026-10-23T10:00:00.000Z",
  [`${U}.EOMTime`]: "2026-10-23T10:00:04.000Z",
  ...extra
}, { _lastInform: new Date().toISOString() });

test("traceroute: hops sorted with rtt average", () => {
  const r = diag.read(igd(), "traceroute");
  assert.equal(r.state, "complete");
  assert.equal(r.hopCount, 2);
  assert.deepEqual(r.hops.map(h => [h.hop, h.host, h.avgMs, h.error]), [[1, "10.115.0.1", 3, null], [2, "8.8.8.8", 12, null]]);
});

test("traceroute: TR-181 field names", () => {
  const B = "Device.IP.Diagnostics.TraceRoute";
  const doc = buildTree({ "Device.DeviceInfo.UpTime": 1, [`${B}.DiagnosticsState`]: "Error_MaxHopCountExceeded", [`${B}.RouteHops.1.Host`]: "gw", [`${B}.RouteHops.1.RTTimes`]: "5", [`${B}.RouteHops.1.ErrorCode`]: 11 });
  const r = diag.read(doc, "traceroute");
  assert.equal(r.state, "error");
  assert.deepEqual(r.hops[0], { hop: 1, host: "gw", address: null, error: 11, rtts: [5], avgMs: 5 });
});

test("upload: throughput from TestFileLength", () => {
  const r = diag.read(igd(), "upload");
  assert.equal(r.state, "complete");
  assert.equal(r.mbps, 20);
  assert.equal(r.seconds, 4);
});

test("request: upload values and missing object is 422", () => {
  const values = diag.request(igd(), "upload", { url: "http://x/u/t", bytes: 5 });
  assert.deepEqual(values.map(v => v[0].split(".").pop()), ["UploadURL", "TestFileLength", "DiagnosticsState"]);
  assert.throws(() => diag.request(igd(), "speed", { url: "u" }), e => e.status === 422);
});

test("liveTask: traceroute refreshes the object, ping reads values", () => {
  assert.deepEqual(diag.liveTask(igd(), "traceroute"), { name: "refreshObject", objectName: T });
  assert.equal(diag.liveTask(igd(), "ping").name, "getParameterValues");
});

test("capabilities: tests and NAT flag", () => {
  const doc = igd();
  const c = capabilities(doc, view.summary(doc), { supportsFirmwareUpgrade: false });
  assert.equal(c.ping.supported, true);
  assert.equal(c.traceroute.supported, true);
  assert.equal(c.upload.supported, true);
  assert.equal(c.download.supported, false);
  assert.equal(c.instantActions.supported, false);
  assert.equal(c.firmware.supported, false);
  assert.equal(c.reboot.supported, true);
});

test("health: grading", () => {
  const now = Date.parse("2026-10-23T12:00:00Z");
  assert.equal(health.gradeMonitor({ lastRunAt: new Date(now - 30e3), devices: 2, durationMs: 50 }, 60, now).status, "ok");
  assert.equal(health.gradeMonitor({ lastRunAt: new Date(now - 400e3) }, 60, now).status, "bad");
  assert.equal(health.gradeMonitor({ lastRunAt: null }, 60, now, 10).status, "warn");
  assert.equal(health.gradeBackup(undefined, now).status, "warn");
  assert.equal(health.gradeBackup(null, now).status, "bad");
  assert.equal(health.gradeBackup({ name: "m", mtime: now - 30 * 3600e3, size: 1e6 }, now).status, "warn");
  assert.equal(health.gradeBackup({ name: "m", mtime: now - 3600e3, size: 1e6 }, now).status, "warn");
  assert.equal(health.gradeBackup({ name: "m", mtime: now - 3600e3, size: 1e6 }, now, now - 3600e3).status, "ok");
  assert.equal(health.gradeDisk(4).status, "bad");
  assert.equal(health.worst([{ status: "ok" }, { status: "warn" }]), "warn");
  assert.equal(health.overall({ database: { status: "ok" }, backup: { status: "bad" } }), "warn");
  assert.equal(health.overall({ nbi: { status: "bad" }, backup: { status: "ok" } }), "bad");
});

test("upload sink: token, drain, size cap", async () => {
  process.env.JWT_SECRET ||= "test-secret";
  process.env.UPLOAD_SINK_MAX_BYTES = "1000";
  const sink = require("../lib/uploadSink");
  const app = express();
  app.put("/speedtest/upload/:token", sink.handler);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const put = (token, size) => new Promise(resolve => {
    const req = http.request({ port: server.address().port, method: "PUT", path: `/speedtest/upload/${token}` }, res => { res.resume(); resolve(res.statusCode); });
    req.on("error", () => resolve("reset"));
    req.end(Buffer.alloc(size));
  });
  try {
    assert.equal(await put(sink.token(), 500), 201);
    assert.equal(await put("wrong", 10), 404);
    assert.ok([413, "reset"].includes(await put(sink.token(), 5000)));
    assert.equal(sink.redact(`http://h/u/${sink.token()}`), "http://h/u/…");
  } finally {
    server.close();
    delete process.env.UPLOAD_SINK_MAX_BYTES;
  }
});
