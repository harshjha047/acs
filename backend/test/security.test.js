const test = require("node:test");
const assert = require("node:assert/strict");
const { buildMatrix, parseMfaRoles, BASE, PERMS } = require("../lib/permissions");
const totp = require("../lib/totp");
const box = require("../lib/secretBox");
const guard = require("../lib/loginGuard");
const { authExpression, parseOuis } = require("../scripts/setCwmpAuth");
const { requirePerm } = require("../middleware/auth");

const has = (m, role, perm) => m[role].has(perm);

test("permission matrix: agent read-only, noc ops, admin all", () => {
  const m = buildMatrix("");
  for (const p of ["wifi.write", "diagnostics.run", "device.refresh", "device.reboot"]) {
    assert.equal(has(m, "agent", p), false, p);
    assert.equal(has(m, "noc", p), true, p);
  }
  for (const p of ["device.read", "device.note", "customer.write"]) assert.equal(has(m, "agent", p), true);
  for (const p of ["firmware.deploy", "factoryReset.execute", "user.manage", "bulk.reboot"]) assert.equal(has(m, "noc", p), false);
  assert.deepEqual([...m.admin].sort(), [...PERMS].sort());
  for (const roles of Object.values(BASE)) assert.ok(roles.includes("admin"));
});

test("PERMS_GRANT adds permissions and rejects typos", () => {
  const m = buildMatrix("agent:diagnostics.run, agent:device.refresh");
  assert.equal(has(m, "agent", "diagnostics.run"), true);
  assert.equal(has(m, "agent", "wifi.write"), false);
  assert.throws(() => buildMatrix("agent:diagnostic.run"));
  assert.throws(() => buildMatrix("guest:device.read"));
});

test("MFA_REQUIRED_ROLES parsing", () => {
  assert.deepEqual(parseMfaRoles(undefined), ["noc", "admin"]);
  assert.deepEqual(parseMfaRoles(""), []);
  assert.throws(() => parseMfaRoles("root"));
});

test("requirePerm gates and rejects unknown permissions", () => {
  const run = role => {
    let status = null, passed = false;
    requirePerm("device.reboot")({ user: { role } }, { status: s => ((status = s), { json: () => {} }) }, () => (passed = true));
    return { status, passed };
  };
  assert.equal(run("noc").passed, true);
  assert.equal(run("agent").status, 403);
  assert.throws(() => requirePerm("device.rebot"));
});

test("TOTP matches RFC 6238 SHA1 vectors", () => {
  const secret = totp.base32Encode(Buffer.from("12345678901234567890"));
  assert.equal(totp.base32Decode(secret).toString(), "12345678901234567890");
  for (const [t, code] of [[59, "287082"], [1111111109, "081804"], [1234567890, "005924"], [2000000000, "279037"]]) {
    assert.equal(totp.codeAt(secret, Math.floor(t / 30)), code);
  }
});

test("TOTP verify: window, format, replay", () => {
  const secret = totp.generateSecret();
  const now = 1_700_000_000_000;
  const step = totp.stepAt(now);
  assert.equal(totp.verify(secret, totp.codeAt(secret, step), { now }), step);
  assert.equal(totp.verify(secret, totp.codeAt(secret, step - 1), { now }), step - 1);
  assert.equal(totp.verify(secret, totp.codeAt(secret, step - 2), { now }), null);
  assert.equal(totp.verify(secret, "12345", { now }), null);
  assert.equal(totp.verify(secret, totp.codeAt(secret, step), { now, lastStep: step }), null);
  assert.match(totp.otpauthUri(secret, "a@b.c", "DIV ACS"), /^otpauth:\/\/totp\/DIV%20ACS%3Aa%40b\.c\?secret=[A-Z2-7]+&issuer=DIV%20ACS/);
});

test("secretBox round-trips and detects tampering", () => {
  process.env.JWT_SECRET ||= "test-secret";
  const sealed = box.seal("JBSWY3DPEHPK3PXP");
  assert.notEqual(box.seal("x"), box.seal("x"));
  assert.equal(box.open(sealed), "JBSWY3DPEHPK3PXP");
  const parts = sealed.split(":");
  parts[3] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => box.open(parts.join(":")));
});

test("login backoff: 5 free attempts then doubling lock capped at 60 min", () => {
  assert.deepEqual([1, 4, 5, 6, 7, 10, 20].map(guard.lockMinutes), [0, 0, 1, 2, 4, 32, 60]);
  const now = 1_000_000;
  assert.equal(guard.failureUpdate(3, now).lockedUntil, null);
  const u = guard.failureUpdate(5, now);
  assert.equal(u.failedLogins, 6);
  assert.equal(u.lockedUntil.getTime(), now + 2 * 60000);
  assert.equal(guard.lockedFor({ lockedUntil: u.lockedUntil }, now), 2);
  assert.equal(guard.lockedFor({}, now), 0);
});

test("cwmp.auth expression with OUI allow-list", () => {
  assert.equal(authExpression("u", "p"), 'AUTH("u", "p")');
  assert.equal(authExpression("u", "p", ["00177C", "202BC1"]), '(DeviceID.OUI = "00177C" OR DeviceID.OUI = "202BC1") AND AUTH("u", "p")');
  assert.deepEqual(parseOuis("00177c, 202BC1,00177C"), ["00177C", "202BC1"]);
  assert.throws(() => parseOuis("00177"));
});
