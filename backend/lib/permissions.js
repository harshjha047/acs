const ROLES = ["agent", "noc", "admin"];
const ALL = ROLES;
const NOC = ["noc", "admin"];
const ADMIN = ["admin"];

const BASE = {
  "device.read": ALL,
  "device.note": ALL,
  "customer.write": ALL,
  "device.refresh": NOC,
  "wifi.write": NOC,
  "diagnostics.run": NOC,
  "device.reboot": NOC,
  "device.tag": NOC,
  "device.capture": NOC,
  "secret.view": NOC,
  "alert.ack": NOC,
  "prereg.write": NOC,
  "template.preview": NOC,
  "system.view": NOC,
  "firmware.view": NOC,
  "template.write": ADMIN,
  "device.provision": ADMIN,
  "bulk.reboot": ADMIN,
  "device.delete": ADMIN,
  "customer.delete": ADMIN,
  "profile.write": ADMIN,
  "user.manage": ADMIN,
  "monitor.run": ADMIN,
  "firmware.manage": ADMIN,
  "firmware.deploy": ADMIN,
  "factoryReset.execute": ADMIN,
  "topology.write": ADMIN
};
const PERMS = Object.keys(BASE);

function parseGrants(spec = "") {
  const grants = [];
  for (const item of String(spec).split(",").map(s => s.trim()).filter(Boolean)) {
    const [role, perm] = item.split(":");
    if (!ROLES.includes(role) || !BASE[perm]) throw new Error(`PERMS_GRANT: unknown "${item}"`);
    grants.push([role, perm]);
  }
  return grants;
}

function buildMatrix(spec) {
  const m = Object.fromEntries(ROLES.map(r => [r, new Set(PERMS.filter(p => BASE[p].includes(r)))]));
  for (const [role, perm] of parseGrants(spec)) m[role].add(perm);
  return m;
}

const matrix = buildMatrix(process.env.PERMS_GRANT);
const permsFor = role => [...(matrix[role] || [])].sort();
const can = (role, perm) => !!matrix[role]?.has(perm);

function parseMfaRoles(spec) {
  const roles = (spec ?? "noc,admin").split(",").map(s => s.trim()).filter(Boolean);
  for (const r of roles) if (!ROLES.includes(r)) throw new Error(`MFA_REQUIRED_ROLES: unknown role "${r}"`);
  return roles;
}
const mfaRoles = parseMfaRoles(process.env.MFA_REQUIRED_ROLES);
const mfaRequired = role => mfaRoles.includes(role);

module.exports = { ROLES, PERMS, BASE, buildMatrix, parseMfaRoles, permsFor, can, mfaRequired };
