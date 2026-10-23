const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const stub = (rel, exports) => {
  const file = require.resolve(path.join(__dirname, "..", rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
const lean = v => ({ lean: async () => v, limit: () => ({ lean: async () => v }) });
const castCheck = f => {
  for (const v of Object.values(f)) if (typeof v === "string" && v.startsWith("new:")) throw new Error(`Cast to ObjectId failed for value "${v}"`);
};
const Model = { findOne: f => (castCheck(f), lean(null)) };
for (const m of ["Pop", "Olt", "PonPort", "Service", "Customer"]) stub(`models/${m}.js`, Model);
stub("models/Device.js", { find: () => lean([{ _id: "aaaaaaaaaaaaaaaaaaaaaaaa", serialNumber: "1234500177CAEA80E" }]) });

const { run } = require("../lib/topologyImport");
const topo = require("../lib/topology");

test("topology import dry run with a new OLT does not query by placeholder ids", async () => {
  const { rows } = topo.normalize(topo.parseCsv("olt,pon,onu_id,mac,pppoe\nKHAROL-olt,EPON0/1,EPON0/1:29,00:17:7C:AE:A8:0E,nareshkaka\n"));
  const r = await run(rows, { dryRun: true });
  assert.deepEqual(r.stats, { rows: 1, pops: 0, olts: 1, ponPorts: 1, servicesCreated: 1, servicesUpdated: 0, devicesLinked: 1, customersCreated: 0, unmatched: 0 });
});
