const NBI = "http://127.0.0.1:7557";

const script = `
const now = Date.now();
declare("InternetGatewayDevice.DeviceInfo.UpTime", {value: now});
declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID", {value: now});
declare("InternetGatewayDevice.LANDevice.1.Hosts.Host.*.*", {path: now, value: now});
`;

const preset = {
  channel: "default",
  weight: 0,
  events: {},
  precondition: "",
  configurations: [{ type: "provision", name: "refresh", args: null }]
};

(async () => {
  for (const [path, body, type] of [
    ["/provisions/refresh", script, "text/plain"],
    ["/presets/refresh", JSON.stringify(preset), "application/json"]
  ]) {
    const res = await fetch(NBI + path, { method: "PUT", body, headers: { "Content-Type": type } });
    console.log(path, res.status);
  }
})();