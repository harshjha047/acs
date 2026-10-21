const router = require("express").Router();
const genie = require("../genieacsClient");
const Device = require("../models/Device");
const AuditLog = require("../models/AuditLog");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

const DEFAULT_PARAMS = {
  uptime: "InternetGatewayDevice.DeviceInfo.UpTime",
  wanIp: "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress",
  ssid: "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID"
};

const resolve = (doc, path) => path.split(".").reduce((acc, key) => acc?.[key], doc);
const extractParam = (doc, path) => resolve(doc, path)?._value ?? null;

function countHosts(doc) {
  const root = resolve(doc, "InternetGatewayDevice.LANDevice.1.Hosts.Host");
  if (!root) return null;
  return Object.keys(root).filter(k => !k.startsWith("_")).length;
}

router.get("/", async (req, res) => {
  try {
    const genieDevices = await genie.listDevices();

    await Promise.all(genieDevices.map(d => {
      const id = d._id;
      const [oui, productClass, serialNumber] = id.split("-");
      const manufacturer = d._deviceId?._Manufacturer || oui;
      return Device.findOneAndUpdate(
        { genieacsDeviceId: id },
        {
          $setOnInsert: { genieacsDeviceId: id, serialNumber, manufacturer, productClass, oui },
          $set: { lastInformAt: d._lastInform ? new Date(d._lastInform) : undefined }
        },
        { upsert: true }
      );
    }));

    res.json(await Device.find().lean());
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch devices", detail: err.message });
  }
});

router.get("/:id/diagnostics", async (req, res) => {
  const device = await Device.findById(req.params.id);
  if (!device) return res.status(404).json({ error: "Device not found" });

  const log = await AuditLog.create({ user: req.user.id, device: device._id, action: "diagnostics_view" });

  try {
    const deviceDoc = await genie.getDevice(device.genieacsDeviceId);
    if (!deviceDoc) throw new Error("Device not found in GenieACS");

    const diagnostics = Object.fromEntries(
      Object.entries(DEFAULT_PARAMS).map(([key, path]) => [key, extractParam(deviceDoc, path)])
    );
    diagnostics.connectedDevices = countHosts(deviceDoc);

    log.result = "success";
    log.details = diagnostics;
    await log.save();
    res.json(diagnostics);
  } catch (err) {
    log.result = "failed";
    log.errorMessage = err.message;
    await log.save();
    res.status(502).json({ error: "Diagnostics failed", detail: err.message });
  }
});

router.post("/:id/reboot", async (req, res) => {
  const device = await Device.findById(req.params.id);
  if (!device) return res.status(404).json({ error: "Device not found" });

  const log = await AuditLog.create({ user: req.user.id, device: device._id, action: "reboot" });

  try {
    const result = await genie.reboot(device.genieacsDeviceId);
    log.result = "success";
    log.details = result;
    await log.save();
    res.json({ message: "Reboot queued", result });
  } catch (err) {
    log.result = "failed";
    log.errorMessage = err.message;
    await log.save();
    res.status(502).json({ error: "Reboot failed", detail: err.message });
  }
});

const SENSITIVE = /password|passphrase|presharedkey|wepkey|secret/i;

function flatten(node, prefix, out) {
  for (const key of Object.keys(node)) {
    if (key.startsWith("_")) continue;
    const child = node[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (child._object === false) {
      out.push({
        path,
        value: SENSITIVE.test(path) && child._value ? "(hidden)" : child._value ?? null,
        type: child._type ?? null,
        writable: !!child._writable,
        timestamp: child._timestamp ?? null
      });
    } else {
      flatten(child, path, out);
    }
  }
  return out;
}

const rootOf = doc => (doc.InternetGatewayDevice ? "InternetGatewayDevice" : doc.Device ? "Device" : null);

router.get("/:id", async (req, res) => {
  const device = await Device.findById(req.params.id).lean();
  if (!device) return res.status(404).json({ error: "Device not found" });
  res.json(device);
});

router.get("/:id/parameters", async (req, res) => {
  const device = await Device.findById(req.params.id);
  if (!device) return res.status(404).json({ error: "Device not found" });

  try {
    const doc = await genie.getDevice(device.genieacsDeviceId);
    if (!doc) throw new Error("Device not found in GenieACS");
    const root = rootOf(doc);
    const parameters = root ? flatten(doc[root], root, []) : [];
    await AuditLog.create({
      user: req.user.id, device: device._id, action: "diagnostics_view",
      details: { view: "parameters", count: parameters.length }, result: "success"
    });
    res.json({ root, lastInform: doc._lastInform, parameters });
  } catch (err) {
    res.status(502).json({ error: "Failed to load parameters", detail: err.message });
  }
});

router.post("/:id/refresh", async (req, res) => {
  const device = await Device.findById(req.params.id);
  if (!device) return res.status(404).json({ error: "Device not found" });

  try {
    const doc = await genie.getDevice(device.genieacsDeviceId);
    const root = doc ? rootOf(doc) : null;
    if (!root) throw new Error("Data model root not found");
    const result = await genie.queueTask(device.genieacsDeviceId, { name: "refreshObject", objectName: root });
    res.json({ message: "Refresh queued", result });
  } catch (err) {
    res.status(502).json({ error: "Refresh failed", detail: err.message });
  }
});

module.exports = router;
