const router = require("express").Router();
const { isValidObjectId } = require("mongoose");
const genie = require("../genieacsClient");
const Device = require("../models/Device");
const AuditLog = require("../models/AuditLog");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

router.param("id", async (req, res, next, id) => {
  if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid device id" });
  req.device = await Device.findById(id);
  if (!req.device) return res.status(404).json({ error: "Device not found" });
  next();
});

const PARAMS = {
  InternetGatewayDevice: {
    uptime: "InternetGatewayDevice.DeviceInfo.UpTime",
    wanIp: "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress",
    ssid: "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID",
    connectedDevices: "InternetGatewayDevice.LANDevice.1.Hosts.HostNumberOfEntries",
    hostTable: "InternetGatewayDevice.LANDevice.1.Hosts.Host"
  },
  Device: {
    uptime: "Device.DeviceInfo.UpTime",
    wanIp: "Device.IP.Interface.1.IPv4Address.1.IPAddress",
    ssid: "Device.WiFi.SSID.1.SSID",
    connectedDevices: "Device.Hosts.HostNumberOfEntries",
    hostTable: "Device.Hosts.Host"
  }
};

const SENSITIVE = /password|passphrase|presharedkey|wepkey|secret/i;
const DEVICE_ID_PROJECTION = ["_deviceId", "_lastInform"];

const resolve = (doc, path) => path.split(".").reduce((acc, key) => acc?.[key], doc);
const rootOf = doc => (doc?.InternetGatewayDevice ? "InternetGatewayDevice" : doc?.Device ? "Device" : null);
const childKeys = node => Object.keys(node || {}).filter(k => !k.startsWith("_"));

async function audit(req, action, run) {
  const log = await AuditLog.create({ user: req.user.id, device: req.device._id, action });
  try {
    const { result = "success", details } = await run();
    Object.assign(log, { result, details });
    await log.save();
    return details;
  } catch (err) {
    Object.assign(log, { result: "failed", errorMessage: err.message });
    await log.save();
    throw err;
  }
}

function flatten(node, prefix, out) {
  for (const key of childKeys(node)) {
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

async function loadTree(req) {
  const doc = await genie.getDevice(req.device.genieacsDeviceId);
  if (!doc) throw Object.assign(new Error("Device not found in GenieACS"), { status: 404 });
  return doc;
}

router.get("/", async (req, res) => {
  const genieDevices = await genie.listDevices({}, DEVICE_ID_PROJECTION);

  await Device.bulkWrite(genieDevices.map(d => {
    const id = d._deviceId || {};
    return {
      updateOne: {
        filter: { genieacsDeviceId: d._id },
        update: {
          $setOnInsert: {
            genieacsDeviceId: d._id,
            serialNumber: id._SerialNumber || d._id,
            manufacturer: id._Manufacturer || id._OUI || "unknown",
            productClass: id._ProductClass || "unknown",
            oui: id._OUI || "unknown"
          },
          ...(d._lastInform && { $set: { lastInformAt: new Date(d._lastInform) } })
        },
        upsert: true
      }
    };
  }), { ordered: false });

  res.json(await Device.find().sort({ lastInformAt: -1 }).lean());
});

router.get("/:id", (req, res) => res.json(req.device));

router.get("/:id/diagnostics", async (req, res) => {
  const details = await audit(req, "diagnostics_view", async () => {
    let doc = await loadTree(req);
    const map = PARAMS[rootOf(doc)];
    if (!map) throw new Error("Unsupported data model");

    const scalar = ["uptime", "wanIp", "ssid", "connectedDevices"].map(k => map[k]).filter(p => resolve(doc, p) !== undefined);
    const { outcome } = scalar.length
      ? await genie.getParameterValues(req.device.genieacsDeviceId, scalar)
      : { outcome: "pending" };
    if (outcome === "success") doc = await loadTree(req);

    const value = key => resolve(doc, map[key])?._value ?? null;
    return {
      result: outcome,
      details: {
        fresh: outcome === "success",
        lastInform: doc._lastInform ?? null,
        uptime: value("uptime"),
        wanIp: value("wanIp"),
        ssid: value("ssid"),
        connectedDevices: value("connectedDevices") ?? (childKeys(resolve(doc, map.hostTable)).length || null)
      }
    };
  });
  res.json(details);
});

router.get("/:id/parameters", async (req, res) => {
  const doc = await loadTree(req);
  const root = rootOf(doc);
  const parameters = root ? flatten(doc[root], root, []) : [];
  await AuditLog.create({
    user: req.user.id, device: req.device._id, action: "diagnostics_view",
    details: { view: "parameters", count: parameters.length }, result: "success"
  });
  res.json({ root, lastInform: doc._lastInform, parameters });
});

router.post("/:id/refresh", async (req, res) => {
  const root = rootOf(await loadTree(req));
  if (!root) return res.status(422).json({ error: "Data model root not found" });
  const { outcome } = await genie.refreshObject(req.device.genieacsDeviceId, root);
  res.status(outcome === "success" ? 200 : 202).json({ outcome });
});

router.post("/:id/reboot", async (req, res) => {
  const details = await audit(req, "reboot", async () => {
    const { outcome, reason } = await genie.reboot(req.device.genieacsDeviceId);
    return { result: outcome, details: { outcome, reason } };
  });
  res.status(details.outcome === "success" ? 200 : 202).json(details);
});

module.exports = router;
