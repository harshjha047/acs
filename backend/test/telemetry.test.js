const test = require("node:test");
const assert = require("node:assert/strict");
const t = require("../lib/telemetry");
const { buildTree } = require("./helpers");

const IGD = "InternetGatewayDevice";
const W = `${IGD}.WANDevice.1`;
const PPP = `${W}.WANConnectionDevice.1.WANPPPConnection.1`;

const realtek = (over = {}) => buildTree({
  [`${IGD}.DeviceInfo.UpTime`]: 3600,
  [`${IGD}.DeviceInfo.SoftwareVersion`]: "V3.2.02-221128",
  [`${IGD}.ManagementServer.PeriodicInformInterval`]: 300,
  [`${W}.X_CT-COM_EponInterfaceConfig.RXPower`]: 257,
  [`${W}.X_CT-COM_EponInterfaceConfig.TXPower`]: 15500,
  [`${W}.X_CT-COM_EponInterfaceConfig.TransceiverTemperature`]: 11520,
  [`${W}.X_CT-COM_EponInterfaceConfig.BiasCurrent`]: 5000,
  [`${W}.X_CT-COM_EponInterfaceConfig.Stats.FECError`]: 120,
  [`${PPP}.ConnectionStatus`]: "Connected",
  [`${PPP}.ExternalIPAddress`]: "10.115.2.46",
  [`${PPP}.Username`]: "nareshkaka",
  [`${PPP}.Uptime`]: 3500,
  [`${PPP}.Stats.EthernetBytesSent`]: 1000,
  [`${PPP}.Stats.EthernetBytesReceived`]: 5000,
  ...over
}, { _lastInform: "2026-10-23T04:33:37Z", _lastBoot: "2026-10-23T03:33:37Z" });

const profile = { verifiedOnRealDevice: true, units: { rxPower: "0.1uW", txPower: "0.1uW" } };

test("sample extracts Realtek EPON telemetry", () => {
  const s = t.sample(realtek(), profile);
  assert.equal(s.rxDbm, -15.9);
  assert.equal(s.tempC, 45);
  assert.equal(s.fecErrors, 120);
  assert.equal(s.wanUp, true);
  assert.equal(s.wanIp, "10.115.2.46");
  assert.equal(s.pppUptime, 3500);
  assert.equal(s.bytesIn, 5000);
  assert.equal(s.bytesOut, 1000);
  assert.equal(s.informInterval, 300);
  assert.equal(s.lastBoot.toISOString(), "2026-10-23T03:33:37.000Z");
});

test("detect: boot via _lastBoot, IP and firmware change", () => {
  const prev = t.sample(realtek(), profile);
  const cur = t.sample(buildTree({
    [`${IGD}.DeviceInfo.UpTime`]: 80,
    [`${IGD}.DeviceInfo.SoftwareVersion`]: "V3.3",
    [`${PPP}.ConnectionStatus`]: "Connected",
    [`${PPP}.ExternalIPAddress`]: "10.115.2.99",
    [`${PPP}.Uptime`]: 40
  }, { _lastInform: "2026-10-23T04:30:04Z", _lastBoot: "2026-10-23T04:30:04Z" }), profile);
  const types = t.detect(prev, cur).map(e => e.type);
  assert.deepEqual(types, ["boot", "ip_change", "firmware_change"]);
});

test("detect: uptime reset without _lastBoot; PPP reconnect; WAN down", () => {
  const base = { _lastInform: "2026-10-23T04:00:00Z" };
  const prev = t.sample(buildTree({ [`${IGD}.DeviceInfo.UpTime`]: 5000, [`${PPP}.ConnectionStatus`]: "Connected", [`${PPP}.Uptime`]: 4000 }, base));
  const booted = t.sample(buildTree({ [`${IGD}.DeviceInfo.UpTime`]: 100 }, { _lastInform: "2026-10-23T04:05:00Z" }));
  const [boot] = t.detect(prev, booted);
  assert.equal(boot.type, "boot");
  assert.equal(boot.at.toISOString(), "2026-10-23T04:03:20.000Z");

  const ppp = t.sample(buildTree({ [`${IGD}.DeviceInfo.UpTime`]: 5300, [`${PPP}.ConnectionStatus`]: "Connected", [`${PPP}.Uptime`]: 60 }, { _lastInform: "2026-10-23T04:05:00Z" }));
  assert.deepEqual(t.detect(prev, ppp).map(e => e.type), ["ppp_reconnect"]);

  const down = t.sample(buildTree({ [`${IGD}.DeviceInfo.UpTime`]: 5300, [`${PPP}.ConnectionStatus`]: "Disconnected" }, { _lastInform: "2026-10-23T04:05:00Z" }));
  assert.deepEqual(t.detect(prev, down).map(e => e.type), ["wan_down"]);
  assert.deepEqual(t.detect(prev, prev), []);
  assert.deepEqual(t.detect(undefined, prev), []);
});

test("isOnline window", () => {
  const now = Date.parse("2026-10-23T05:00:00Z");
  assert.equal(t.isOnline("2026-10-23T04:50:00Z", 300, now), true);
  assert.equal(t.isOnline("2026-10-23T04:47:59Z", 300, now), false);
  assert.equal(t.isOnline(null, 300, now), false);
});

test("alertsFor: offline, low Rx only on verified profiles, reboot loop", () => {
  const now = Date.parse("2026-10-23T05:00:00Z");
  const off = t.alertsFor({ online: false, mon: { lastInform: "2026-10-23T03:30:00Z" }, now });
  assert.deepEqual(off.map(a => [a.type, a.severity]), [["offline", "critical"]]);
  assert.equal(t.alertsFor({ online: true, verified: false, mon: { rxDbm: -30 } }).length, 0);
  assert.deepEqual(t.alertsFor({ online: true, verified: true, mon: { rxDbm: -28 } }).map(a => a.severity), ["warn"]);
  assert.deepEqual(t.alertsFor({ online: true, verified: true, mon: { rxDbm: -30 } }).map(a => a.severity), ["critical"]);
  assert.deepEqual(t.alertsFor({ online: true, mon: {}, boots: 3 }).map(a => a.type), ["reboot_loop"]);
});

test("series: FEC delta and throughput handle counter resets", () => {
  const at = m => new Date(Date.parse("2026-10-23T04:00:00Z") + m * 60000);
  const pts = t.series([
    { at: at(0), fec: 100, bytesIn: 0, bytesOut: 0 },
    { at: at(5), fec: 130, bytesIn: 37500000, bytesOut: 3750000 },
    { at: at(10), fec: 5, bytesIn: 100, bytesOut: 100 }
  ]);
  assert.deepEqual(pts.map(p => p.fecDelta), [null, 30, null]);
  assert.equal(pts[1].inKbps, 1000);
  assert.equal(pts[1].outKbps, 100);
  assert.equal(pts[2].inKbps, null);
});

test("clusters: groups offline devices within 10 min", () => {
  const at = m => new Date(Date.parse("2026-10-23T04:00:00Z") + m * 60000);
  const offline = [0, 2, 4, 30, 60, 61, 62, 63].map((m, i) => ({ _id: `d${i}`, offlineSince: at(m) }));
  const c = t.clusters(offline);
  assert.deepEqual(c.map(g => g.count), [4, 3]);
});
