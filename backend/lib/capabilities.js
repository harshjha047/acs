const view = require("./deviceView");
const diag = require("./diagnostics");
const { ROOTS } = require("./catalog");
const { rootOf } = require("./tree");

const cap = (supported, detail = null) => ({ supported, detail });

function capabilities(doc, s, profile = {}) {
  const root = rootOf(doc);
  const radios = view.wifi(doc);
  const hosts = view.clients(doc);
  const test = kind => cap(diag.supported(doc, kind), diag.supported(doc, kind) ? null : `${ROOTS[root]?.[diag.KINDS[kind].key] || "Diagnostics object"} not exposed`);
  const cr = s.connectionRequestUrl;
  const ssidWritable = radios.some(r => r.writePaths.ssid && r.writable !== false);

  return {
    ping: test("ping"),
    traceroute: test("traceroute"),
    download: test("speed"),
    upload: test("upload"),
    wifiSsid: cap(ssidWritable, ssidWritable ? null : radios.length ? "SSID is read-only" : "No Wi-Fi found"),
    wifiPassword: cap(radios.some(r => r.writePaths.password), radios.some(r => r.writePaths.password) ? null : "No passphrase path"),
    clientSignal: cap(hosts.some(h => h.signal !== null), hosts.some(h => h.signal !== null) ? null : "RSSI not reported"),
    optical: cap(s.optical.rxPower.dbm !== null, s.optical.rxPower.dbm === null ? "No optical module found" : s.optical.verified ? "Verified" : "Units unverified"),
    reboot: cap(true),
    factoryReset: cap(profile.supportsFactoryReset !== false, profile.supportsFactoryReset === false ? "Disabled in device profile" : null),
    firmware: cap(!!profile.supportsFirmwareUpgrade, profile.supportsFirmwareUpgrade ? null : "Not enabled in device profile"),
    instantActions: cap(!!cr && !view.isPrivate(cr), !cr ? "No connection request URL" : view.isPrivate(cr) ? "Behind NAT: actions run at next check-in" : null)
  };
}

module.exports = { capabilities };
