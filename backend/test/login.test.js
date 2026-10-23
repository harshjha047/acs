const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const express = require("express");
const bcrypt = require("bcryptjs");

process.env.JWT_SECRET = "test-secret";
const stub = (rel, exports) => {
  const file = require.resolve(path.join(__dirname, "..", rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

const totp = require("../lib/totp");
const box = require("../lib/secretBox");
const secret = totp.generateSecret();
const hash = bcrypt.hashSync("correct horse battery", 4);
const db = {
  a: { _id: "a", email: "admin@x", name: "A", role: "admin", isActive: true, passwordHash: hash, tokenVersion: 0, failedLogins: 0, mfa: { enabledAt: new Date(), secret: box.seal(secret) } },
  g: { _id: "g", email: "agent@x", name: "G", role: "agent", isActive: true, passwordHash: hash, tokenVersion: 3, failedLogins: 0 }
};
const events = [];
const set = (doc, update) => {
  for (const [k, v] of Object.entries(update.$set || {})) k.split(".").reduce((o, p, i, a) => (i === a.length - 1 ? (o[p] = v) : (o[p] ??= {})), doc);
  for (const k of Object.keys(update.$unset || {})) delete doc[k];
  for (const [k, v] of Object.entries(update.$inc || {})) doc[k] = (doc[k] || 0) + v;
};
const byEmail = e => Object.values(db).find(u => u.email === e);
const q = v => Object.assign(Promise.resolve(v), { select: async () => v, lean: async () => v });
stub("models/User.js", {
  findOne: async ({ email }) => byEmail(email) || null,
  findById: id => q(db[id] || null),
  updateOne: async ({ _id, $or }, update) => {
    const doc = db[_id];
    if ($or && doc.mfa?.lastStep !== undefined && !(doc.mfa.lastStep < $or[1]["mfa.lastStep"].$lt)) return { modifiedCount: 0 };
    set(doc, update);
    return { modifiedCount: 1 };
  }
});
stub("models/LoginEvent.js", { create: async e => events.push(e) });

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use("/api/auth", require("../routes/auth"));

const post = (base, p, body, ip) => fetch(`${base}${p}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip }, body: JSON.stringify(body) });

test("login: agent gets token with tv, admin gets MFA challenge, code once only, lockout", async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/auth`;
  try {
    const agent = await (await post(base, "/login", { email: "agent@x", password: "correct horse battery" }, "1.1.1.1")).json();
    assert.equal(JSON.parse(Buffer.from(agent.token.split(".")[1], "base64url")).tv, 3);
    assert.ok(!agent.user.permissions.includes("wifi.write"));

    const ch = await (await post(base, "/login", { email: "admin@x", password: "correct horse battery" }, "1.1.1.2")).json();
    assert.equal(ch.mfaRequired, true);
    assert.equal(ch.token, undefined);

    const code = totp.codeAt(secret, totp.stepAt());
    const ok = await post(base, "/mfa/verify", { mfaToken: ch.mfaToken, code }, "1.1.1.2");
    assert.equal(ok.status, 200);
    assert.ok((await ok.json()).token);
    assert.equal((await post(base, "/mfa/verify", { mfaToken: ch.mfaToken, code }, "1.1.1.2")).status, 401);

    for (let i = 0; i < 5; i++) assert.equal((await post(base, "/login", { email: "agent@x", password: "wrong password!!" }, `2.0.0.${i}`)).status, 401);
    const blocked = await post(base, "/login", { email: "agent@x", password: "correct horse battery" }, "2.0.1.1");
    assert.equal(blocked.status, 429);
    assert.equal((await post(base, "/login", { email: "nobody@x", password: "x" }, "3.0.0.1")).status, 401);
    assert.deepEqual([...new Set(events.map(e => e.reason))].sort(), ["bad_mfa", "bad_password", "locked", "mfa_ok", "mfa_pending", "ok", "unknown_user"]);
  } finally {
    server.close();
  }
});
