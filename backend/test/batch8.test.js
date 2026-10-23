const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { buildTree } = require("./helpers");
const trends = require("../lib/trends");
const health = require("../lib/deviceHealth");
const { diagnose } = require("../lib/rootCause");
const topo = require("../lib/topology");
const t = require("../lib/telemetry");

const good = { online: true, verified: true, mon: { rxDbm: -16, tempC: 48, wanUp: true, wanStatus: "Connected", lanUp: 1, lan100: 0 } };
const codes = x => diagnose(x).map(c => c.code);

test("trends: counter delta handles resets; rx drop is old minus current", () => {
  assert.equal(trends.counterDelta(100, 160), 60);
  assert.equal(trends.counterDelta(500, 20), 20);
  assert.equal(trends.counterDelta(null, 5), null);
  assert.equal(trends.rxDrop(-16, -19.04), 3);
  assert.equal(trends.rxDrop(null, -19), null);
});

test("trends: device alert rules", () => {
  assert.deepEqual(trends.deviceAlerts(good), []);
  const a = trends.deviceAlerts({
    ...good, rxDrop: 4.5, fecHour: 2000, wanDown1h: 3, ppp1h: 4,
    mon: { ...good.mon, tempC: 82, lan100: 1 }, unexpectedFirmware: { from: "A", to: "B" }
  });
  const by = Object.fromEntries(a.map(x => [x.type, x.severity]));
  assert.deepEqual(by, { optical_degrading: "critical", high_temp: "critical", high_fec: "warn", wan_flapping: "warn", ppp_flapping: "warn", lan_100m: "info", firmware_changed: "info" });
  assert.equal(trends.deviceAlerts({ ...good, verified: false, rxDrop: 5 }).length, 0);
  assert.equal(trends.deviceAlerts({ ...good, online: false, mon: { ...good.mon, tempC: 90 } }).length, 0);
});

test("trends: PON outage needs min count and ratio", () => {
  assert.equal(trends.ponOutage({ ponPort: "p", label: "OLT 0/1", total: 10, offline: 2 }), null);
  assert.equal(trends.ponOutage({ ponPort: "p", label: "OLT 0/1", total: 10, offline: 4 }), null);
  const o = trends.ponOutage({ ponPort: "p", label: "OLT 0/1", total: 10, offline: 9, since: new Date("2026-10-23T10:00:00Z") });
  assert.equal(o.severity, "critical");
  assert.equal(o.affected, 9);
  assert.equal(o.cause.code, "feeder_or_olt");
  assert.equal(trends.ponOutage({ ponPort: "p", label: "x", total: 8, offline: 5 }).severity, "warn");
});

test("health: good, degraded, offline, unknown", () => {
  const g = health.score({ ...good, boots24: 0 });
  assert.equal(g.status, "good");
  assert.equal(g.score, 100);
  const bad = health.score({ ...good, mon: { ...good.mon, rxDbm: -28, lan100: 1 }, boots24: 2, ppp24: 1 });
  assert.equal(bad.status, "fair");
  assert.ok(bad.score < 65, `score ${bad.score}`);
  assert.equal(bad.components.ethernet.score, 70);
  const down = health.score({ ...good, mon: { ...good.mon, wanUp: false } });
  assert.ok(down.score <= 40);
  assert.equal(health.score({ ...good, online: false }).status, "offline");
  assert.equal(health.score({ ...good, online: null }), null);
  const unverified = health.score({ ...good, verified: false });
  assert.equal(unverified.components.optical, null);
  assert.equal(unverified.score, 100);
});

test("root cause: offline device split by PON state", () => {
  const off = { ...good, online: false, offlineMin: 12 };
  assert.deepEqual(codes({ ...off, pon: { label: "OLT 0/1", total: 10, offline: 9, outage: true } }), ["pon_outage"]);
  const local = diagnose({ ...off, mon: { ...good.mon, rxDbm: -28.5 }, pon: { label: "OLT 0/1", total: 10, offline: 1, outage: false } });
  assert.equal(local[0].code, "cpe_local");
  assert.equal(local[0].confidence, 0.8);
  assert.match(local[0].evidence[0], /9 of 9 other ONUs/);
  assert.deepEqual(codes({ ...off, pon: null }), ["offline_unmapped"]);
});

test("root cause: online symptoms", () => {
  assert.deepEqual(codes(good), ["ok"]);
  assert.equal(codes({ ...good, mon: { ...good.mon, rxDbm: -29.5 } })[0], "optical_low");
  assert.equal(codes({ ...good, mon: { ...good.mon, wanUp: false, wanStatus: "Disconnected" } })[0], "wan_down");
  assert.ok(codes({ ...good, ppp1h: 3, ppp24: 5 }).includes("pppoe_upstream"));
  assert.ok(!codes({ ...good, ppp1h: 3, boots24: 1 }).includes("pppoe_upstream"));
  assert.ok(codes({ ...good, boots24: 3 }).includes("power_instability"));
  assert.ok(codes({ ...good, rxDrop: 2.5 }).includes("optical_degrading"));
  assert.ok(codes({ ...good, mon: { ...good.mon, lan100: 1 } }).includes("lan_link"));
});

test("topology: CSV parsing (quotes, BOM, semicolons, CRLF)", () => {
  assert.deepEqual(topo.parseCsv('﻿olt,pon\r\n"A, B",EPON0/1\r\n\r\n'), [["olt", "pon"], ["A, B", "EPON0/1"]]);
  assert.deepEqual(topo.parseCsv('olt;pon\nX;"say ""hi"""\n'), [["olt", "pon"], ["X", 'say "hi"']]);
});

test("topology: PON label and MAC normalisation", () => {
  assert.deepEqual(topo.parsePon("EPON0/1"), { slot: "0", port: "1", label: "EPON0/1" });
  assert.deepEqual(topo.parsePon("", "EPON0/1:29"), { slot: "0", port: "1", label: "EPON0/1" });
  assert.deepEqual(topo.parsePon("0/2/7"), { slot: "0/2", port: "7", label: "0/2/7" });
  assert.deepEqual(topo.parsePon("PON-3"), { slot: "", port: "PON-3", label: "PON-3" });
  assert.equal(topo.normMac("00-17-7C-AE-A8-0E"), "00:17:7c:ae:a8:0e");
  assert.equal(topo.normMac("00177c"), null);
});

test("topology: normalize rows, aliases, errors, duplicates", () => {
  const csv = [
    "OLT Name,PON Port,ONU,MAC Address,PPPoE Username,Account ID,extra",
    "KHAROL-olt,,EPON0/1:29,00:17:7C:AE:A8:0E,nareshkaka,ACC1,x",
    "KHAROL-olt,EPON0/2,,zz,,,",
    ",EPON0/3,EPON0/3:1,,,,",
    "KHAROL-olt,EPON0/1,EPON0/1:30,,nareshkaka,,"
  ].join("\n");
  const { rows, errors, unknownColumns } = topo.normalize(topo.parseCsv(csv));
  assert.deepEqual(unknownColumns, ["extra"]);
  assert.equal(rows.length, 1);
  const [r] = rows;
  assert.equal(r.serviceId, "nareshkaka");
  assert.equal(r.mac, "00:17:7c:ae:a8:0e");
  assert.equal(r.olt.ponType, "EPON");
  assert.deepEqual(r.pon, { slot: "0", port: "1", label: "EPON0/1" });
  assert.deepEqual(errors.map(e => e.line), [3, 4, 5]);
  assert.match(errors[0].error, /bad mac "zz"/);
  assert.match(errors[2].error, /duplicate service nareshkaka/);
  assert.match(topo.normalize(topo.parseCsv("pon\nx")).errors[0].error, /Missing column: olt/);
});

test("telemetry: LAN 100M on a gigabit port is flagged; FE-only ports are not", () => {
  const L = "InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig";
  const s = t.sample(buildTree({
    [`${L}.1.Status`]: "Up", [`${L}.1.MaxBitRate`]: "Auto", [`${L}.1.CurrentBitRate`]: 1000,
    [`${L}.2.Status`]: "Up", [`${L}.2.MaxBitRate`]: "Auto", [`${L}.2.CurrentBitRate`]: 100,
    [`${L}.3.Status`]: "Up", [`${L}.3.MaxBitRate`]: 100, [`${L}.3.CurrentBitRate`]: 100,
    [`${L}.4.Status`]: "NoLink"
  }));
  assert.equal(s.lanUp, 3);
  assert.equal(s.lan100, 1);
  assert.equal(t.sample(buildTree({ "InternetGatewayDevice.DeviceInfo.UpTime": 5 })).lan100, null);
});

test("alertSync: inserts, updates, closes only its own types; PON keyed by port", async () => {
  const file = require.resolve(path.join(__dirname, "..", "models/Alert.js"));
  const saved = require.cache[file];
  const ops = [];
  const open = [
    { _id: 1, device: "d1", type: "high_temp" },
    { _id: 2, device: "d2", type: "high_temp" },
    { _id: 3, device: "d1", type: "offline" },
    { _id: 4, ponPort: "p1", type: "pon_outage" }
  ];
  require.cache[file] = { id: file, filename: file, loaded: true, exports: { find: () => ({ lean: async () => open }), bulkWrite: async o => ops.push(...o) } };
  delete require.cache[require.resolve("../lib/alertSync")];
  const { reconcile } = require("../lib/alertSync");
  await reconcile([{ device: "d1", type: "high_temp", severity: "critical", message: "m" }, { device: "d3", type: "lan_100m", severity: "info" }], ["high_temp", "lan_100m"]);
  assert.deepEqual(ops.map(o => (o.insertOne ? ["ins", o.insertOne.document.device] : [o.updateOne.filter._id, o.updateOne.update.$set.open ?? "upd"])), [[1, "upd"], [2, false], ["ins", "d3"]]);
  ops.length = 0;
  await reconcile([{ ponPort: "p2", type: "pon_outage", severity: "warn" }], ["pon_outage"]);
  assert.deepEqual(ops.map(o => (o.insertOne ? ["ins", o.insertOne.document.ponPort] : [o.updateOne.filter._id, o.updateOne.update.$set.open])), [[4, false], ["ins", "p2"]]);
  if (saved) require.cache[file] = saved; else delete require.cache[file];
  delete require.cache[require.resolve("../lib/alertSync")];
});
