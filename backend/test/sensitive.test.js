const test = require("node:test");
const assert = require("node:assert/strict");
const { mask } = require("../lib/sensitive");

const I = "InternetGatewayDevice";
const hidden = [
  `${I}.DeviceConfig.ConfigFile`,
  `${I}.LANDevice.1.WLANConfiguration.1.KeyPassphrase`,
  `${I}.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey`,
  `${I}.LANDevice.1.WLANConfiguration.1.WEPKey.1.WEPKey`,
  `${I}.LANDevice.1.WLANConfiguration.1.WPS.DevicePassword`,
  `${I}.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Password`,
  `${I}.ManagementServer.ConnectionRequestPassword`,
  `${I}.ManagementServer.STUNPassword`,
  `${I}.X_CT-COM_UserInfo.Password`,
  `${I}.Services.VoiceService.1.VoiceProfile.1.Line.1.SIP.AuthPassword`,
  `${I}.X_HW_Security.X_HW_Passwd`,
  `${I}.DeviceInfo.X_CT-COM_ServiceManage.FtpUserName`
];
const shown = [
  `${I}.DeviceInfo.SoftwareVersion`,
  `${I}.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username`,
  `${I}.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.PPPAuthenticationProtocol`,
  `${I}.LANDevice.1.WLANConfiguration.1.WPAAuthenticationMode`,
  `${I}.LANDevice.1.WLANConfiguration.1.X_CT-COM_WPSKeyWord`,
  `${I}.LANDevice.1.WLANConfiguration.1.WEPKeyIndex`,
  `${I}.DeviceInfo.VendorConfigFileNumberOfEntries`
];

test("secrets are masked", () => {
  for (const p of hidden) assert.equal(mask(p, "s3cret-value"), "(hidden)", p);
});

test("operational values are shown", () => {
  for (const p of shown) assert.equal(mask(p, "value"), "value", p);
});

test("long values that embed credentials are masked regardless of path", () => {
  const xml = `<Config><Value Name="pppPasswd" Value="x"/>${"<Value Name=\"A\" Value=\"1\"/>".repeat(5)}</Config>`;
  assert.equal(mask(`${I}.X_VENDOR.Blob`, xml), "(hidden)");
});

test("empty and null stay as-is", () => {
  assert.equal(mask(`${I}.ManagementServer.Password`, ""), "");
  assert.equal(mask(`${I}.ManagementServer.Password`, null), null);
});
