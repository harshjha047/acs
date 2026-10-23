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
const users = {
  u1: { _id: "u1", role: "admin", isActive: true, email: "a@b", mfa: { enabledAt: new Date() } },
  agent: { _id: "agent", role: "agent", isActive: true, email: "ag@b" },
  nomfa: { _id: "nomfa", role: "noc", isActive: true, email: "n@b" },
  old: { _id: "old", role: "admin", isActive: true, email: "o@b", tokenVersion: 2, mfa: { enabledAt: new Date() } }
};
stub("models/User.js", { findById: id => ({ lean: async () => users[id] || null }) });
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
const post = (base, p, body, t = token) => fetch(`${base}${p}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` }, body: JSON.stringify(body) });

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

test("auth: agent blocked from actions, MFA setup enforced, revoked and challenge tokens rejected", async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/devices/${device._id}`;
  const sign = claims => jwt.sign(claims, process.env.JWT_SECRET);
  try {
    for (const p of ["/reboot", "/refresh", "/diagnostics/ping"]) assert.equal((await post(base, p, {}, sign({ id: "agent" }))).status, 403, p);
    const nomfa = await post(base, "/reboot", {}, sign({ id: "nomfa" }));
    assert.equal(nomfa.status, 403);
    assert.equal((await nomfa.json()).mfaSetupRequired, true);
    assert.equal((await post(base, "/reboot", {}, sign({ id: "old", tv: 1 }))).status, 401);
    assert.equal((await post(base, "/reboot", {}, sign({ id: "u1", purpose: "mfa" }))).status, 401);
  } finally {
    server.close();
  }
});
