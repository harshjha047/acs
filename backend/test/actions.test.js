const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "test-secret";
const stub = (rel, exports) => {
  const file = require.resolve(path.join(__dirname, "..", rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

const tasks = [];
let rebootCalls = 0;
const device = { _id: "65f000000000000000000001", genieacsDeviceId: "dev-1" };
stub("models/User.js", { findById: () => ({ lean: async () => ({ _id: "u1", role: "admin", isActive: true, email: "a@b" }) }) });
stub("models/Device.js", { findById: async () => device });
stub("models/AuditLog.js", { create: async () => ({ save: async () => {} }), findOne: () => ({ sort: () => ({ lean: async () => null }) }) });
stub("genieacsClient.js", {
  getTasks: async () => tasks,
  reboot: async () => {
    rebootCalls++;
    await new Promise(r => setTimeout(r, 50));
    tasks.push({ name: "reboot" });
    return { outcome: "pending", task: { _id: "t1" } };
  }
});

const app = express();
app.use(express.json());
app.use("/api/devices", require("../routes/devices"));
app.use((err, req, res, next) => res.status(500).json({ error: err.message }));

const token = jwt.sign({ id: "u1" }, process.env.JWT_SECRET);
const post = (base, p, body) => fetch(`${base}${p}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });

test("reboot: parallel clicks send one task, later clicks get 409 while queued, then rate limit", async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/devices/${device._id}`;
  try {
    const first = await Promise.all([1, 2, 3].map(() => post(base, "/reboot", { reason: "test" })));
    const codes = first.map(r => r.status).sort();
    assert.deepEqual(codes, [202, 409, 409]);
    assert.equal(rebootCalls, 1);

    const again = await post(base, "/reboot", { reason: "test" });
    assert.equal(again.status, 409);
    assert.match((await again.json()).error, /already queued/);

    let last;
    for (let i = 0; i < 20; i++) last = await post(base, "/reboot", { reason: "test" });
    assert.equal(last.status, 429);
    assert.equal(rebootCalls, 1);
  } finally {
    server.close();
  }
});
