const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { buildTree } = require("./helpers");

const stub = (rel, exports) => {
  const file = require.resolve(path.join(__dirname, "..", rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
const q = v => ({ lean: async () => v, sort: () => ({ lean: async () => v }) });

const IGD = "InternetGatewayDevice";
const PPP = `${IGD}.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1`;
let nbi = [];
const devices = new Map();
const events = [];
const samples = [];
const alerts = [];
const rebootLog = { _id: "a1", timestamp: new Date("2026-10-23T04:28:37.700Z"), result: "pending", details: {}, save: async () => {} };

stub("genieacsClient.js", { listDevices: async (qry, proj, { skip }) => (skip ? [] : nbi) });
stub("models/DeviceProfile.js", { find: () => q([]) });
stub("models/Device.js", {
  find: () => q([...devices.values()]),
  findOneAndUpdate: async (f, u) => {
    const d = { _id: `oid-${devices.size + 1}`, ...u.$setOnInsert };
    devices.set(d._id, d);
    return d;
  },
  bulkWrite: async ops => ops.forEach(({ updateOne: { filter, update } }) => Object.assign(devices.get(filter._id), update.$set)),
  updateMany: async () => ({})
});
stub("models/Telemetry.js", { insertMany: async s => samples.push(...s) });
stub("models/DeviceEvent.js", { insertMany: async e => events.push(...e), updateOne: async () => ({}), aggregate: async () => [] });
stub("models/AuditLog.js", { findOne: () => ({ sort: async () => (rebootLog.result === "pending" ? rebootLog : null) }), updateMany: async () => ({}) });
stub("models/Alert.js", {
  find: () => q(alerts.filter(a => a.open)),
  updateOne: async (f, u) => alerts.push({ ...f, ...u.$setOnInsert }),
  bulkWrite: async ops => ops.forEach(o => (o.insertOne ? alerts.push({ open: true, ...o.insertOne.document }) : Object.assign(alerts.find(a => a._id === o.updateOne.filter._id) || {}, o.updateOne.update.$set)))
});

const monitor = require("../lib/monitor");

const ont = (uptime, lastInform, lastBoot) => ({
  _id: "00177C-DG%2DGR6821AC-1234500177CAEA80E",
  ...buildTree({ [`${IGD}.DeviceInfo.UpTime`]: uptime, [`${PPP}.ConnectionStatus`]: "Connected", [`${PPP}.ExternalIPAddress`]: "10.115.2.46" },
    { _deviceId: { _Manufacturer: "Realtek", _OUI: "00177C", _ProductClass: "DG-GR6821AC", _SerialNumber: "1234500177CAEA80E" }, _lastInform: lastInform, _lastBoot: lastBoot })
});

test("monitor: registers, samples, detects reboot and closes the pending audit with downtime", async () => {
  nbi = [ont(3600, new Date(Date.now() - 60000).toISOString(), "2026-10-22T00:00:00Z")];
  let s = await monitor.run();
  assert.equal(s.error, null);
  const [dev] = devices.values();
  assert.equal(dev.online, true);
  assert.deepEqual(events.map(e => e.type), ["registered"]);
  assert.equal(alerts.filter(a => a.type === "unknown_device").length, 1);
  assert.equal(samples.length, 1);

  dev.mon.lastInform = new Date("2026-10-23T04:28:37Z");
  nbi = [ont(40, new Date().toISOString(), "2026-10-23T04:30:04.200Z")];
  s = await monitor.run();
  assert.equal(s.error, null);
  assert.ok(events.some(e => e.type === "boot"));
  assert.equal(rebootLog.result, "success");
  assert.equal(rebootLog.details.downtimeSec, 87);

  nbi = [ont(400, new Date(Date.now() - 3600 * 1000).toISOString(), "2026-10-23T04:30:04.200Z")];
  await monitor.run();
  assert.ok(events.some(e => e.type === "offline"));
  assert.ok(alerts.some(a => a.type === "offline" && a.open));
});
