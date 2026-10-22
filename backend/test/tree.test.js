const test = require("node:test");
const assert = require("node:assert/strict");
const { expand, leaves, valueOf, get, rootOf } = require("../lib/tree");
const { buildTree } = require("./helpers");

const doc = buildTree({
  "Device.WiFi.SSID.1.SSID": "home",
  "Device.WiFi.SSID.2.SSID": "home-5g",
  "Device.WiFi.SSID.X_Vendor.SSID": "ignored"
});

test("rootOf detects data model", () => {
  assert.equal(rootOf(doc), "Device");
  assert.equal(rootOf(buildTree({ "InternetGatewayDevice.DeviceInfo.UpTime": 1 })), "InternetGatewayDevice");
  assert.equal(rootOf({}), null);
});

test("expand matches only numeric instances for *", () => {
  assert.deepEqual(expand(doc, "Device.WiFi.SSID.*.SSID").map(([p]) => p), ["Device.WiFi.SSID.1.SSID", "Device.WiFi.SSID.2.SSID"]);
});

test("leaves and valueOf", () => {
  assert.equal(leaves(doc.Device, "Device").length, 3);
  assert.equal(valueOf(get(doc, "Device.WiFi.SSID.2.SSID")), "home-5g");
  assert.equal(valueOf(get(doc, "Device.WiFi.SSID.2")), null);
});
