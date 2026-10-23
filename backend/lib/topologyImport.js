const Pop = require("../models/Pop");
const Olt = require("../models/Olt");
const PonPort = require("../models/PonPort");
const Service = require("../models/Service");
const Device = require("../models/Device");
const Customer = require("../models/Customer");

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const compact = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ""));

async function matchDevice(r) {
  const tries = [
    r.serial && { serialNumber: new RegExp(`^${escapeRe(r.serial)}$`, "i") },
    r.mac && { macAddress: r.mac },
    r.mac && { serialNumber: new RegExp(`${r.mac.replace(/:/g, "")}$`, "i") },
    r.pppoe && { pppoeUsername: r.pppoe }
  ].filter(Boolean);
  for (const q of tries) {
    const hits = await Device.find({ ...q, removedAt: null }, "_id customer serialNumber").limit(2).lean();
    if (hits.length === 1) return { device: hits[0] };
    if (hits.length > 1) return { ambiguous: `${Object.keys(q)[0]} matches several devices` };
  }
  return {};
}

async function run(rows, { dryRun = true } = {}) {
  const stats = { rows: rows.length, pops: 0, olts: 0, ponPorts: 0, servicesCreated: 0, servicesUpdated: 0, devicesLinked: 0, customersCreated: 0, unmatched: 0 };
  const warnings = [];
  const cache = { pop: new Map(), olt: new Map(), port: new Map() };
  const fakeId = k => `new:${k}`;

  async function upsert(Model, kind, key, filter, set) {
    if (cache[kind].has(key)) return cache[kind].get(key);
    let doc = await Model.findOne(filter, "_id").lean();
    if (!doc) {
      stats[{ pop: "pops", olt: "olts", port: "ponPorts" }[kind]]++;
      doc = dryRun ? { _id: fakeId(key) } : await Model.findOneAndUpdate(filter, { $set: set }, { upsert: true, new: true, lean: true });
    } else if (!dryRun && Object.keys(set).length) await Model.updateOne({ _id: doc._id }, { $set: set });
    cache[kind].set(key, doc._id);
    return doc._id;
  }

  for (const r of rows) {
    const pop = r.pop ? await upsert(Pop, "pop", r.pop, { name: r.pop }, { name: r.pop }) : null;
    const olt = await upsert(Olt, "olt", r.olt.name, { name: r.olt.name }, compact({ name: r.olt.name, pop, vendor: r.olt.vendor, model: r.olt.model, mgmtIp: r.olt.mgmtIp, ponType: r.olt.ponType }));
    const portKey = `${r.olt.name}|${r.pon.slot}|${r.pon.port}`;
    const ponPort = await upsert(PonPort, "port", portKey, { olt, slot: r.pon.slot, port: r.pon.port }, { olt, slot: r.pon.slot, port: r.pon.port, label: r.pon.label });

    let customer = null;
    if (r.account) {
      customer = (await Customer.findOne({ accountId: r.account }, "_id").lean())?._id || null;
      if (!customer && r.customerName) {
        stats.customersCreated++;
        customer = dryRun ? fakeId(r.account) : (await Customer.create(compact({ accountId: r.account, name: r.customerName, phone: r.phone })))._id;
      } else if (!customer) warnings.push({ line: r.line, warning: `account ${r.account} not found (add customer_name to create it)` });
    }

    const m = await matchDevice(r);
    if (m.ambiguous) warnings.push({ line: r.line, warning: m.ambiguous });
    if (m.device) {
      stats.devicesLinked++;
      if (customer && m.device.customer && String(m.device.customer) !== String(customer)) {
        warnings.push({ line: r.line, warning: `device ${m.device.serialNumber} is linked to another customer; left unchanged` });
      }
    } else stats.unmatched++;

    const existing = await Service.findOne({ serviceId: r.serviceId }, "_id").lean();
    stats[existing ? "servicesUpdated" : "servicesCreated"]++;
    if (dryRun) continue;

    const set = compact({
      ponPort, customer, onuId: r.onuId, serialNumber: r.serial, macAddress: r.mac, pppoeUsername: r.pppoe, plan: r.plan, vlan: r.vlan, splitter: r.splitter,
      device: m.device?._id, status: r.status || (m.device ? "active" : undefined)
    });
    const svc = await Service.findOneAndUpdate({ serviceId: r.serviceId }, { $set: set, $setOnInsert: { serviceId: r.serviceId, ...(m.device && !r.status && { activatedAt: new Date() }) } }, { upsert: true, new: true, lean: true });
    if (m.device) {
      await Service.updateMany({ device: m.device._id, _id: { $ne: svc._id } }, { $unset: { device: "" } });
      await Device.updateOne({ _id: m.device._id }, { $set: { service: svc._id, ...(customer && !m.device.customer && { customer }) } });
    }
  }
  return { dryRun, stats, warnings };
}

module.exports = { run };
