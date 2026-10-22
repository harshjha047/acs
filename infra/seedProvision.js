const NBI = process.env.NBI_URL || "http://127.0.0.1:7557";

const provisions = {
  inform: `
const daily = Date.now(86400000);
for (const ms of ["InternetGatewayDevice.ManagementServer", "Device.ManagementServer"]) {
  declare(ms + ".PeriodicInformEnable", {value: daily}, {value: true});
  declare(ms + ".PeriodicInformInterval", {value: daily}, {value: 300});
}
`,
  fullscan: `
const now = Date.now();
const root = declare("InternetGatewayDevice.DeviceInfo.SoftwareVersion", {value: 1}).size ? "InternetGatewayDevice" : "Device";
for (let depth = 1; depth <= 8; depth++) declare(root + ".*".repeat(depth), {path: now, value: now});
`,
  refresh: `
const now = Date.now();
const igd = declare("InternetGatewayDevice.DeviceInfo.UpTime", {value: now}).size;
if (igd) {
  declare("InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.SSID", {value: now});
  declare("InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.Enable", {value: now});
  declare("InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.Channel", {value: now});
  declare("InternetGatewayDevice.LANDevice.*.Hosts.Host.*.*", {path: now, value: now});
  declare("InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.*.*.ConnectionStatus", {value: now});
  declare("InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.*.*.ExternalIPAddress", {value: now});
  const daily = Date.now(86400000);
  for (const o of ["X_CT-COM_EponInterfaceConfig", "X_CT-COM_GponInterfaceConfig", "X_HW_GponInterfaceConfig", "X_GponInterafceConfig", "X_ZTE-COM_WANPONInterfaceConfig"]) {
    declare("InternetGatewayDevice.WANDevice.*." + o + ".*", {path: daily, value: now});
  }
} else {
  declare("Device.DeviceInfo.UpTime", {value: now});
  declare("Device.WiFi.SSID.*.SSID", {value: now});
  declare("Device.Hosts.Host.*.*", {path: now, value: now});
  declare("Device.Optical.Interface.*.*", {path: Date.now(86400000), value: now});
}
`,
  diagnostics: `
const now = Date.now();
const igd = declare("InternetGatewayDevice.DeviceInfo.UpTime", {value: 1}).size;
const bases = igd
  ? ["InternetGatewayDevice.IPPingDiagnostics", "InternetGatewayDevice.DownloadDiagnostics"]
  : ["Device.IP.Diagnostics.IPPing", "Device.IP.Diagnostics.DownloadDiagnostics"];
for (const b of bases) declare(b + ".*", {value: now});
`
};

const presets = {
  inform: { channel: "inform", weight: 0, events: { "0 BOOTSTRAP": true, "1 BOOT": true }, precondition: "", configurations: [{ type: "provision", name: "inform", args: null }] },
  "fullscan-bootstrap": { channel: "fullscan", weight: 100, events: { "0 BOOTSTRAP": true }, precondition: "", configurations: [{ type: "provision", name: "fullscan", args: null }] },
  refresh: { channel: "default", weight: 0, events: { "2 PERIODIC": true }, precondition: "", configurations: [{ type: "provision", name: "refresh", args: null }] },
  diagnostics: { channel: "diagnostics", weight: 0, events: { "8 DIAGNOSTICS COMPLETE": true }, precondition: "", configurations: [{ type: "provision", name: "diagnostics", args: null }] }
};

const obsoletePresets = ["fullscan"];

async function waitForNbi(tries = 30) {
  for (let i = 1; i <= tries; i++) {
    try {
      if ((await fetch(`${NBI}/presets?projection=_id`)).ok) return;
    } catch {}
    console.log(`waiting for NBI (${i}/${tries})`);
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`NBI not reachable at ${NBI}`);
}

(async () => {
  await waitForNbi();
  for (const name of obsoletePresets) {
    const res = await fetch(`${NBI}/presets/${name}`, { method: "DELETE" });
    console.log(`preset ${name} removed`, res.status);
  }
  for (const [name, script] of Object.entries(provisions)) {
    const res = await fetch(`${NBI}/provisions/${name}`, { method: "PUT", body: script.trim(), headers: { "Content-Type": "text/plain" } });
    console.log(`provision ${name}`, res.status);
  }
  for (const [name, preset] of Object.entries(presets)) {
    const res = await fetch(`${NBI}/presets/${name}`, { method: "PUT", body: JSON.stringify(preset), headers: { "Content-Type": "application/json" } });
    console.log(`preset ${name}`, res.status);
  }
})();
