const test = require("node:test");
const assert = require("node:assert/strict");
const { requireRole } = require("../middleware/auth");

const run = (role, ...allowed) => {
  let status = null, passed = false;
  const res = { status: s => ((status = s), { json: () => {} }) };
  requireRole(...allowed)({ user: { role } }, res, () => (passed = true));
  return { status, passed };
};

test("requireRole gates by role", () => {
  assert.equal(run("admin", "noc", "admin").passed, true);
  assert.equal(run("noc", "noc", "admin").passed, true);
  assert.equal(run("agent", "noc", "admin").status, 403);
  assert.equal(run("noc", "admin").status, 403);
});
