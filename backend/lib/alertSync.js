const Alert = require("../models/Alert");

const deviceKey = a => `${a.device}:${a.type}`;
const ponKey = a => `pon:${a.ponPort}:${a.type}`;
const keyOf = a => (a.type === "pon_outage" ? ponKey(a) : deviceKey(a));

async function reconcile(desired, types, now = new Date(), { keep = ["unknown_device"] } = {}) {
  const want = new Map(desired.filter(a => types.includes(a.type)).map(a => [keyOf(a), a]));
  const open = (await Alert.find({ open: true, type: { $in: types } }, "device ponPort type").lean()).filter(a => types.includes(a.type));
  const openKeys = new Set(open.map(keyOf));
  const ops = [];
  for (const a of open) {
    const w = want.get(keyOf(a));
    if (w) {
      const { device, ponPort, type, ...rest } = w;
      ops.push({ updateOne: { filter: { _id: a._id }, update: { $set: { ...rest, lastSeenAt: now } } } });
    } else if (!keep.includes(a.type)) ops.push({ updateOne: { filter: { _id: a._id }, update: { $set: { open: false, closedAt: now } } } });
  }
  for (const [k, a] of want) if (!openKeys.has(k)) ops.push({ insertOne: { document: { ...a, open: true, openedAt: now, lastSeenAt: now } } });
  if (ops.length) await Alert.bulkWrite(ops, { ordered: false });
  return { opened: ops.filter(o => o.insertOne).length, total: want.size };
}

module.exports = { reconcile, keyOf };
