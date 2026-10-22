const test = require("node:test");
const assert = require("node:assert/strict");
const view = require("../lib/deviceView");
const { buildTree } = require("./helpers");

const IGD = "InternetGatewayDevice";
const W = `${IGD}.LANDevice.1.WLANConfiguration`;

function realtek(extra = {}) {
  const doc = buildTree({
    [`${IGD}.DeviceInfo.SoftwareVersion`]: "V3.2.02-221128",
    [`${IGD}.DeviceInfo.UpTime`]: 176256,
    [`${IGD}.ManagementServer.PeriodicInformInterval`]: 300,
    [`${IGD}.ManagementServer.ConnectionRequestURL`]: "http://10.115.0.10:7547/tr69",
    [`${IGD}.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionStatus`]: "Connected",
    [`${IGD}.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress`]: "10.115.0.10",
    [`${IGD}.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username`]: "test-user",
    [`${W}.1.SSID`]: "Home_5G",
    [`${W}.1.X_CT-COM_RFBand`]: 1,
    [`${W}.5.SSID`]: "Home",
    [`${W}.5.X_CT-COM_RFBand`]: 0,
    [`${W}.5.Enable`]: true,
    [`${IGD}.LANDevice.1.Hosts.Host.1.MACAddress`]: "aa:bb:cc:00:00:01",
    [`${IGD}.LANDevice.1.Hosts.Host.1.Layer2Interface`]: `${W}.1`,
    [`${IGD}.LANDevice.1.Hosts.Host.1.Active`]: true,
    [`${IGD}.LANDevice.1.Hosts.Host.2.MACAddress`]: "aa:bb:cc:00:00:02",
    [`${IGD}.LANDevice.1.Hosts.Host.2.Layer2Interface`]: `${W}.5`,
    [`${IGD}.LANDevice.1.Hosts.Host.2.Active`]: true,
    [`${IGD}.IPPingDiagnostics.AverageResponseTime`]: 12,
    ...extra
  }, { _lastInform: new Date().toISOString() });
  doc.InternetGatewayDevice.LANDevice["1"].WLANConfiguration["1"].Enable = { _object: false, _writable: true };
  return doc;
}

test("wifi: unfetched Enable is unknown, not disabled", () => {
  const radios = view.wifi(realtek());
  assert.equal(radios.find(r => r.ssid === "Home_5G").enabled, null);
  assert.equal(radios.find(r => r.ssid === "Home").enabled, true);
});

test("wifi: X_CT-COM_RFBand 0/1 maps to 2.4/5 GHz", () => {
  const radios = view.wifi(realtek());
  assert.equal(radios.find(r => r.ssid === "Home_5G").band, "5 GHz");
  assert.equal(radios.find(r => r.ssid === "Home").band, "2.4 GHz");
});

test("clients: Layer2Interface WLANConfiguration.1 does not match .10+ and carries band", () => {
  const rows = view.clients(realtek());
  const a = rows.find(r => r.mac === "aa:bb:cc:00:00:01");
  assert.equal(a.ssid, "Home_5G");
  assert.equal(a.band, "5 GHz");
  assert.equal(a.via, "wifi");
});

test("optical: CT-COM EPON RXPower in 0.1uW", () => {
  const doc = realtek({
    [`${IGD}.WANDevice.1.X_CT-COM_EponInterfaceConfig.RXPower`]: 100,
    [`${IGD}.WANDevice.1.X_CT-COM_EponInterfaceConfig.TXPower`]: 20000
  });
  const s = view.summary(doc);
  assert.equal(s.optical.rxPower.dbm, -20);
  assert.equal(s.optical.rxPower.unit, "0.1uW");
  assert.equal(s.optical.rxPower.assumed, true);
  assert.equal(s.optical.txPower.dbm, 3.01);
});

test("readiness: reports value coverage, unknown Wi-Fi state, no 'Response' false optical hits", () => {
  const doc = realtek();
  const r = view.readiness(doc, view.summary(doc));
  const values = r.items.find(i => i.feature === "Parameter values fetched");
  assert.ok(values);
  assert.match(r.items.find(i => i.feature === "Wi-Fi SSIDs").detail, /1 enabled, 1 unknown/);
  assert.equal(r.opticalCandidates.some(c => /ResponseTime/.test(c.path)), false);
  assert.equal(r.items.find(i => i.feature === "Connection request (instant actions)").status, "warn");
});
