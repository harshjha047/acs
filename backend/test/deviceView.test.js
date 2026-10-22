const test = require("node:test");
const assert = require("node:assert/strict");
const view = require("../lib/deviceView");
const { buildTree } = require("./helpers");

const IGD = "InternetGatewayDevice";

test("toDbm unit handling", () => {
  assert.deepEqual(view.toDbm("-21.5", "x.RXPower").dbm, -21.5);
  assert.equal(view.toDbm("-215", "x.RXPower").dbm, -21.5);
  assert.equal(view.toDbm("-21500", "Device.Optical.Interface.1.OpticalSignalLevel").dbm, -21.5);
  assert.equal(view.toDbm("2000", `${IGD}.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower`).dbm, -6.99);
  assert.equal(view.toDbm("100", "x", "uW").dbm, -10);
  assert.equal(view.toDbm("", "x").dbm, null);
  assert.equal(view.toDbm("n/a", "x").dbm, null);
  assert.equal(view.toDbm("-21.5", "x").assumed, true);
  assert.equal(view.toDbm("-21.5", "x", "dBm").assumed, false);
});

test("gradeOptical thresholds", () => {
  assert.equal(view.gradeOptical("rxPower", -20), "ok");
  assert.equal(view.gradeOptical("rxPower", -26), "warn");
  assert.equal(view.gradeOptical("rxPower", -29), "bad");
  assert.equal(view.gradeOptical("rxPower", -6), "bad");
  assert.equal(view.gradeOptical("txPower", 2.5), "ok");
  assert.equal(view.gradeOptical("txPower", -1), "bad");
  assert.equal(view.gradeOptical("rxPower", null), "unknown");
});

const huawei = buildTree({
  [`${IGD}.DeviceInfo.SoftwareVersion`]: "V5R020",
  [`${IGD}.DeviceInfo.UpTime`]: 3600,
  [`${IGD}.ManagementServer.PeriodicInformInterval`]: 300,
  [`${IGD}.WANDevice.1.X_HW_GponInterfaceConfig.RXPower`]: "-19.80",
  [`${IGD}.WANDevice.1.X_HW_GponInterfaceConfig.TXPower`]: "2.10",
  [`${IGD}.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.Name`]: "1_TR069_R_VID_100",
  [`${IGD}.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ConnectionStatus`]: "Connected",
  [`${IGD}.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress`]: "10.1.1.5",
  [`${IGD}.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Name`]: "2_INTERNET_R_VID_200",
  [`${IGD}.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ConnectionStatus`]: "Connected",
  [`${IGD}.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ExternalIPAddress`]: "103.1.2.3",
  [`${IGD}.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username`]: "cust001",
  [`${IGD}.LANDevice.1.WLANConfiguration.1.SSID`]: "Home",
  [`${IGD}.LANDevice.1.WLANConfiguration.1.Enable`]: "1",
  [`${IGD}.LANDevice.1.WLANConfiguration.1.Channel`]: 6,
  [`${IGD}.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase`]: "",
  [`${IGD}.LANDevice.1.WLANConfiguration.1.AssociatedDevice.1.AssociatedDeviceMACAddress`]: "AA:BB:CC:00:00:01",
  [`${IGD}.LANDevice.1.WLANConfiguration.1.AssociatedDevice.1.X_HW_RSSI`]: -70,
  [`${IGD}.LANDevice.1.Hosts.Host.1.MACAddress`]: "aa:bb:cc:00:00:01",
  [`${IGD}.LANDevice.1.Hosts.Host.1.HostName`]: "phone",
  [`${IGD}.LANDevice.1.Hosts.Host.1.Active`]: "1",
  [`${IGD}.LANDevice.1.Hosts.Host.2.MACAddress`]: "aa:bb:cc:00:00:02",
  [`${IGD}.LANDevice.1.Hosts.Host.2.InterfaceType`]: "Ethernet",
  [`${IGD}.LANDevice.1.Hosts.Host.2.Layer2Interface`]: `${IGD}.LANDevice.1.LANEthernetInterfaceConfig.2`,
  [`${IGD}.LANDevice.1.Hosts.Host.2.Active`]: "0"
}, { _lastInform: new Date().toISOString(), _deviceId: { _Manufacturer: "Huawei", _OUI: "00E0FC", _ProductClass: "HG8145V5", _SerialNumber: "485754" } });

test("summary: IGD Huawei ONT", () => {
  const s = view.summary(huawei);
  assert.equal(s.root, IGD);
  assert.equal(s.online.state, "online");
  assert.equal(s.identity.productClass, "HG8145V5");
  assert.equal(s.identity.softwareVersion, "V5R020");
  assert.equal(s.uptime, 3600);
  assert.equal(s.wan.primary.kind, "PPPoE");
  assert.equal(s.wan.primary.Username, "cust001");
  assert.equal(s.wan.primary.ExternalIPAddress, "103.1.2.3");
  assert.equal(s.optical.rxPower.dbm, -19.8);
  assert.equal(s.optical.rxPower.grade, "ok");
  assert.equal(s.optical.rxPower.source, "catalog");
  assert.equal(s.optical.txPower.dbm, 2.1);
  assert.equal(s.counts.clients, 2);
  assert.equal(s.counts.activeClients, 1);
});

test("summary: offline when last inform is stale", () => {
  const stale = { ...huawei, _lastInform: new Date(Date.now() - 3600e3).toISOString() };
  assert.equal(view.summary(stale).online.state, "offline");
});

test("wifi: IGD radio and write paths", () => {
  const [r] = view.wifi(huawei);
  assert.equal(r.ssid, "Home");
  assert.equal(r.enabled, true);
  assert.equal(r.band, "2.4 GHz");
  assert.equal(r.writePaths.password, `${IGD}.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase`);
});

test("clients: merges association data with hosts", () => {
  const rows = view.clients(huawei);
  const phone = rows.find(r => r.mac === "aa:bb:cc:00:00:01");
  assert.equal(phone.via, "wifi");
  assert.equal(phone.signal, -70);
  assert.equal(phone.signalGrade, "warn");
  const pc = rows.find(r => r.mac === "aa:bb:cc:00:00:02");
  assert.equal(pc.via, "ethernet");
  assert.equal(pc.port, "2");
  assert.equal(rows[0].active, true);
});

test("optical: pattern fallback is flagged and unit assumed", () => {
  const doc = buildTree({ [`${IGD}.DeviceInfo.UpTime`]: 1, [`${IGD}.X_ACME_Pon.RxPower`]: "-23.4" });
  const rx = view.resolveOptical(doc, "rxPower");
  assert.equal(rx.source, "pattern");
  assert.equal(rx.dbm, -23.4);
  assert.equal(rx.assumed, true);
});

test("optical: profile unit overrides heuristic", () => {
  const doc = buildTree({ [`${IGD}.DeviceInfo.UpTime`]: 1, [`${IGD}.X_ACME_Pon.RxPower`]: "500" });
  const rx = view.resolveOptical(doc, "rxPower", { parameterMap: { rxPower: `${IGD}.X_ACME_Pon.RxPower` }, units: { rxPower: "0.1uW" } });
  assert.equal(rx.dbm, -13.01);
  assert.equal(rx.assumed, false);
});

test("TR-181: PPP WAN resolves IP via LowerLayers", () => {
  const doc = buildTree({
    "Device.DeviceInfo.UpTime": 10,
    "Device.PPP.Interface.1.Status": "Up",
    "Device.PPP.Interface.1.Username": "cust002",
    "Device.IP.Interface.1.Name": "lan",
    "Device.IP.Interface.2.Name": "wan",
    "Device.IP.Interface.2.LowerLayers": "Device.PPP.Interface.1",
    "Device.IP.Interface.2.IPv4Address.1.IPAddress": "103.9.9.9"
  });
  const wan = view.wanConnections(doc);
  const ppp = wan.find(w => w.kind === "PPPoE");
  assert.equal(ppp.ExternalIPAddress, "103.9.9.9");
  assert.equal(ppp.Username, "cust002");
  assert.equal(wan.filter(w => w.kind === "IP").length, 0);
});
