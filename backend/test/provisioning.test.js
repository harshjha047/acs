const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { buildTree } = require("./helpers");
const p = require("../lib/provisioning");

const IGD = "InternetGatewayDevice";
const W = `${IGD}.LANDevice.1.WLANConfiguration`;
const realtek = () => buildTree({
  [`${IGD}.DeviceInfo.UpTime`]: 100,
  [`${IGD}.Time.NTPServer1`]: "pool.ntp.org",
  [`${W}.1.SSID`]: "old5", [`${W}.1.Enable`]: "1", [`${W}.1.X_CT-COM_RFBand`]: 1, [`${W}.1.PreSharedKey.1.KeyPassphrase`]: "",
  [`${W}.2.SSID`]: "guest5", [`${W}.2.Enable`]: "0", [`${W}.2.X_CT-COM_RFBand`]: 1,
  [`${W}.5.SSID`]: "old24", [`${W}.5.Enable`]: "1", [`${W}.5.X_CT-COM_RFBand`]: 0, [`${W}.5.PreSharedKey.1.KeyPassphrase`]: ""
});
const ctx = { serialNumber: "1234500177CAEA80E", macAddress: "00:17:7c:ae:a8:0e", customer: { accountId: "NK-29", phone: "+91 98765 43210" } };

test("renderName: tokens, unknown token, overflow", () => {
  assert.equal(p.renderName("FAB5-{serial4}", ctx), "FAB5-A80E");
  assert.equal(p.renderName("{account}_{mac4}_{phone4}", ctx), "NK-29_A80E_3210");
  assert.throws(() => p.renderName("X-{nope}", ctx), /Unknown token/);
  assert.throws(() => p.renderName("{account}", { customer: {} }), /no value/);
  assert.throws(() => p.renderName("A".repeat(33), ctx), /1-32/);
});

test("plan: one SSID per band on the primary interface, password on both, 5 GHz suffix", () => {
  const r = p.plan(realtek(), { wifi: { ssid: "FAB5-{serial4}" }, params: [{ path: `${IGD}.Time.NTPServer1`, value: "time.google.com", type: "xsd:string" }, { path: `${IGD}.Nope.X`, value: 1, type: "xsd:int" }] }, { overrides: { password: "s3cretpass" }, ctx });
  const map = Object.fromEntries(r.values.map(([k, v]) => [k, v]));
  assert.equal(map[`${W}.5.SSID`], "FAB5-A80E");
  assert.equal(map[`${W}.1.SSID`], "FAB5-A80E-5G");
  assert.equal(map[`${W}.2.SSID`], undefined);
  assert.equal(map[`${W}.1.PreSharedKey.1.KeyPassphrase`], "s3cretpass");
  assert.equal(map[`${W}.5.PreSharedKey.1.KeyPassphrase`], "s3cretpass");
  assert.equal(map[`${IGD}.Time.NTPServer1`], "time.google.com");
  assert.ok(r.changes.every(c => !c.includes("s3cretpass")));
  assert.deepEqual(r.skipped, [`${IGD}.Nope.X: not on this device`]);
  assert.equal(r.waiting, null);
});

test("plan: waits when Wi-Fi is not discovered yet; params-only templates do not wait", () => {
  const bare = buildTree({ [`${IGD}.DeviceInfo.UpTime`]: 1 });
  assert.match(p.plan(bare, { wifi: { ssid: "X" } }, { ctx }).waiting, /not discovered/);
  assert.equal(p.plan(bare, { params: [] }, { ctx }).waiting, null);
});

test("validateTemplate: rejects ACS-managed paths, bad tokens, bad tags; coerces values", () => {
  assert.throws(() => p.validateTemplate({ name: "x", params: [{ path: `${IGD}.ManagementServer.URL`, value: "http://evil" }] }), /managed by the ACS/);
  assert.throws(() => p.validateTemplate({ name: "x", params: [{ path: `${IGD}.ManagementServer.PeriodicInformInterval`, value: 60, type: "xsd:unsignedInt" }] }), /managed by the ACS/);
  assert.throws(() => p.validateTemplate({ name: "x", wifi: { ssid: "ISP-{bogus}" } }), /SSID pattern/);
  assert.throws(() => p.validateTemplate({ name: "x", tags: ["Bad Tag"] }), /Invalid tag/);
  assert.throws(() => p.validateTemplate({ name: "" }), /Name is required/);
  const t = p.validateTemplate({ name: " Default ", params: [{ path: `${IGD}.X.Enable`, value: "1", type: "xsd:boolean" }], tags: "Pilot, phase1" });
  assert.equal(t.name, "Default");
  assert.equal(t.params[0].value, true);
  assert.deepEqual(t.tags, ["pilot", "phase1"]);
});

test("assertAutoSafe: auto-apply templates cannot touch Wi-Fi", () => {
  assert.throws(() => p.assertAutoSafe({ autoApplyToNew: true, wifi: { ssid: "A-{serial4}" } }), /pre-registration/);
  assert.doesNotThrow(() => p.assertAutoSafe({ autoApplyToNew: true, wifi: { password: "keep" }, params: [] }));
});

test("matchTemplate: most specific wins, then priority; inactive ignored", () => {
  const ts = [
    { name: "all", match: {}, priority: 9 },
    { name: "realtek", match: { manufacturer: "realtek" } },
    { name: "gr6821", match: { manufacturer: "Realtek", productClass: "DG-GR6821AC" } },
    { name: "off", match: { productClass: "DG-GR6821AC" }, isActive: false, priority: 99 }
  ];
  assert.equal(p.matchTemplate(ts, { manufacturer: "Realtek", productClass: "DG-GR6821AC" }).name, "gr6821");
  assert.equal(p.matchTemplate(ts, { manufacturer: "Realtek", productClass: "Other" }).name, "realtek");
  assert.equal(p.matchTemplate(ts, { manufacturer: "ZTE", productClass: "F660" }).name, "all");
});

test("normalizers and password generator", () => {
  assert.equal(p.normMac("00-17-7C-AE-A8-0E"), "00:17:7c:ae:a8:0e");
  assert.equal(p.normMac("00177caea80e"), "00:17:7c:ae:a8:0e");
  assert.throws(() => p.normMac("00:17"), /12 hex/);
  assert.equal(p.normSerial(" abc123 "), "ABC123");
  const pw = p.generatePassword();
  assert.match(pw, /^[A-HJ-NP-Za-km-z2-9]{12}$/);
});

const stub = (rel, exports) => {
  const file = require.resolve(path.join(__dirname, "..", rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

test("provisioner: pre-registration match → pending → queued → applied; fault → failed", async () => {
  const tpl = { _id: "t1", name: "Default", isActive: true, wifi: { ssid: "FAB5-{serial4}", password: "generate" }, tags: ["fab5"] };
  const device = { _id: "d1", genieacsDeviceId: "G1", serialNumber: "1234500177CAEA80E", macAddress: "00:17:7c:ae:a8:0e", tags: [] };
  const pre = { _id: "p1", status: "waiting", macAddress: "00:17:7c:ae:a8:0e", customer: "c1", template: "t1", tags: ["pilot"], createdBy: "u1" };
  const audits = [];
  let tasks = [];
  let faults = [];
  const apply = (doc, u) => {
    for (const [k, v] of Object.entries(u.$set || {})) {
      const keys = k.split(".");
      let n = doc;
      for (const key of keys.slice(0, -1)) n = n[key] ??= {};
      n[keys.at(-1)] = v;
    }
    if (u.$addToSet) doc.tags = [...new Set([...doc.tags, ...u.$addToSet.tags.$each])];
  };
  const lean = v => ({ lean: async () => v });
  stub("models/ProvisioningTemplate.js", { findById: () => lean(tpl), find: () => lean([]) });
  stub("models/Customer.js", { findById: () => lean({ accountId: "NK-29" }) });
  stub("models/PreRegistration.js", {
    find: () => ({ select: () => lean(pre.status === "waiting" ? [{ ...pre, wifiPassword: undefined }] : []) }),
    updateOne: async (f, u) => { Object.assign(pre, u.$set); return { modifiedCount: 1 }; }
  });
  stub("models/Device.js", {
    findOne: async q => (q.$or.some(c => c.macAddress === device.macAddress) ? device : null),
    updateOne: async (f, u) => {
      if (f["provisioning.state"] === "pending" && device.provisioning?.state !== "pending") return { matchedCount: 0, modifiedCount: 0 };
      apply(device, u);
      return { matchedCount: 1, modifiedCount: 1 };
    },
    find: () => ({ select: () => ({ sort: () => ({ limit: async () => (device.provisioning?.state === "pending" ? [device] : []) }) }), sort: () => ({ limit: async () => (device.provisioning?.state === "queued" ? [device] : []) }), limit: async () => [] })
  });
  stub("models/AuditLog.js", {
    create: async d => { const a = { _id: `a${audits.length}`, ...d }; audits.push(a); return a; },
    updateOne: async (f, u) => apply(audits.find(a => a._id === f._id) || {}, u)
  });
  stub("genieacsClient.js", {
    getDevice: async () => realtek(),
    queueTask: async (id, task) => { tasks.push({ _id: "task1", ...task }); return { outcome: "pending", task: { _id: "task1" } }; },
    getTasks: async () => tasks,
    getFaults: async () => faults
  });
  delete require.cache[require.resolve("../lib/provisioner")];
  const prov = require("../lib/provisioner");

  let r = await prov.tick();
  assert.equal(r.matched, 1);
  assert.equal(device.customer, "c1");
  assert.deepEqual(device.tags.sort(), ["fab5", "pilot"]);
  assert.equal(device.provisioning.state, "queued");
  assert.equal(device.provisioning.overrides.password.length, 12);
  const sent = tasks[0].parameterValues.map(([k]) => k);
  assert.ok(sent.includes(`${W}.5.SSID`) && sent.includes(`${W}.1.SSID`));
  assert.equal(audits.find(a => a.action === "auto_provision").details.changes.some(c => c.includes(device.provisioning.overrides.password)), false);

  r = await prov.tick();
  assert.equal(device.provisioning.state, "queued");
  tasks = [];
  await prov.tick();
  assert.equal(device.provisioning.state, "applied");
  assert.equal(audits.find(a => a.action === "auto_provision").result, "success");

  Object.assign(device.provisioning, { state: "queued", queuedAt: new Date() });
  tasks = [{ _id: "task1" }];
  faults = [{ _id: "G1:task_task1", code: "cwmp.9007", message: "Invalid parameter value", detail: { faultString: "Invalid value" } }];
  await prov.tick();
  assert.equal(device.provisioning.state, "failed");
  assert.match(device.provisioning.error, /9007/);
});
