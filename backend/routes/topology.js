const router = require("express").Router();
const express = require("express");
const { isValidObjectId } = require("mongoose");
const Olt = require("../models/Olt");
const Pop = require("../models/Pop");
const PonPort = require("../models/PonPort");
const Service = require("../models/Service");
const Device = require("../models/Device");
const Alert = require("../models/Alert");
const { requireAuth, requirePerm } = require("../middleware/auth");
const topo = require("../lib/topology");
const importer = require("../lib/topologyImport");
const intel = require("../lib/intel");

const MAX_ROWS = 20000;

router.use(requireAuth);

router.get("/", async (req, res) => {
  const [pops, olts, stats, outages] = await Promise.all([
    Pop.find().sort({ name: 1 }).lean(),
    Olt.find().sort({ name: 1 }).lean(),
    intel.portStats(null, new Map()),
    Alert.find({ open: true, type: "pon_outage" }, "ponPort severity openedAt").lean()
  ]);
  const ports = await PonPort.find().sort({ slot: 1, port: 1 }).lean();
  const outageBy = new Map(outages.map(a => [String(a.ponPort), a]));
  const byOlt = Map.groupBy(ports, p => String(p.olt));
  res.json({
    pops,
    olts: olts.map(o => ({
      ...o,
      ports: (byOlt.get(String(o._id)) || []).map(p => {
        const s = stats.get(String(p._id));
        return { _id: p._id, slot: p.slot, port: p.port, label: p.label, capacity: p.capacity, total: s?.total || 0, online: s?.online || 0, offline: s?.offline || 0, since: s?.since || null, outage: outageBy.get(String(p._id)) || null };
      })
    }))
  });
});

router.get("/ports/:portId", async (req, res) => {
  if (!isValidObjectId(req.params.portId)) return res.status(400).json({ error: "Invalid port id" });
  const port = await PonPort.findById(req.params.portId).populate({ path: "olt", populate: { path: "pop", select: "name" } }).lean();
  if (!port) return res.status(404).json({ error: "PON port not found" });
  const services = await Service.find({ ponPort: port._id }).sort({ onuId: 1 })
    .populate("customer", "name accountId phone")
    .populate("device", "serialNumber productClass online offlineSince lastInformAt rxPower rxGrade health.score health.status")
    .lean();
  res.json({ port: { ...port, name: topo.portLabel(port, port.olt) }, services });
});

router.post("/import", requirePerm("topology.write"), express.text({ type: ["text/csv", "text/plain", "application/octet-stream"], limit: "5mb" }), async (req, res) => {
  if (typeof req.body !== "string" || !req.body.trim()) return res.status(400).json({ error: "Send the CSV as text/csv" });
  const records = topo.parseCsv(req.body);
  if (records.length - 1 > MAX_ROWS) return res.status(413).json({ error: `At most ${MAX_ROWS} rows per import` });
  const { rows, errors, unknownColumns } = topo.normalize(records);
  const dryRun = req.query.dryRun !== "0";
  if (!dryRun && errors.length && req.query.skipErrors !== "1") {
    return res.status(422).json({ error: `${errors.length} row(s) have errors. Fix them or import with skipErrors=1.`, errors: errors.slice(0, 200) });
  }
  const result = await importer.run(rows, { dryRun });
  if (!dryRun) intel.tick(new Date(), { force: true }).catch(() => {});
  res.json({ ...result, errors: errors.slice(0, 200), errorCount: errors.length, unknownColumns });
});

router.delete("/services/:serviceId", requirePerm("topology.write"), async (req, res) => {
  if (!isValidObjectId(req.params.serviceId)) return res.status(400).json({ error: "Invalid service id" });
  const svc = await Service.findByIdAndDelete(req.params.serviceId).lean();
  if (!svc) return res.status(404).json({ error: "Service not found" });
  if (svc.device) await Device.updateOne({ _id: svc.device, service: svc._id }, { $unset: { service: "" } });
  res.json({ ok: true });
});

router.get("/template.csv", (req, res) => {
  res.type("text/csv").attachment("topology-template.csv")
    .send(`${topo.COLUMNS.join(",")}\nKharol,KHAROL-olt,Optronix,,,EPON,EPON0/1,EPON0/1:29,,00:17:7C:AE:A8:0E,nareshkaka,ACC1001,Naresh,,,,,SPL-1A,active\n`);
});

module.exports = router;
