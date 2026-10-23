const crypto = require("node:crypto");
const { get } = require("./tree");
const view = require("./deviceView");

const SSID_RE = /^[\x20-\x7e]{1,32}$/;
const PSK_RE = /^[\x20-\x7e]{8,63}$/;
const SERIAL_RE = /^[A-Za-z0-9_-]{4,64}$/;
const TAG_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const PARAM_PATH = /^(InternetGatewayDevice|Device)(\.[A-Za-z0-9_-]+)+$/;
const FORBIDDEN_PATH = /\.ManagementServer\.(URL|Username|Password|ConnectionRequest\w*|PeriodicInform\w*|STUN\w*)$|\.DeviceConfig\.|\.X_[A-Z0-9-]+_(Super|Telnet|Ssh)/i;
const TYPES = ["xsd:string", "xsd:boolean", "xsd:unsignedInt", "xsd:int"];
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const TOKENS = ["serial4", "serial6", "mac4", "mac6", "account", "phone4"];

const bad = msg => Object.assign(new Error(msg), { status: 400 });
const alnum = s => String(s || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
const ci = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();

function generatePassword(length = 12) {
  return Array.from({ length }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join("");
}

function normMac(v) {
  if (v === undefined || v === null || v === "") return null;
  const hex = String(v).replace(/[^0-9a-f]/gi, "").toLowerCase();
  if (hex.length !== 12) throw bad("MAC must have 12 hex digits");
  return hex.match(/../g).join(":");
}

function normSerial(v) {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).trim();
  if (!SERIAL_RE.test(s)) throw bad("Serial must be 4-64 letters, digits, - or _");
  return s.toUpperCase();
}

function normTags(list) {
  const tags = [...new Set((Array.isArray(list) ? list : String(list || "").split(",")).map(t => String(t).trim().toLowerCase()).filter(Boolean))];
  if (tags.length > 10) throw bad("At most 10 tags");
  const wrong = tags.find(t => !TAG_RE.test(t));
  if (wrong) throw bad(`Invalid tag "${wrong}" (a-z, 0-9, - or _, up to 32)`);
  return tags;
}

function renderName(pattern, ctx = {}) {
  const mac = alnum(ctx.macAddress);
  const values = {
    serial4: alnum(ctx.serialNumber).slice(-4), serial6: alnum(ctx.serialNumber).slice(-6),
    mac4: mac.slice(-4), mac6: mac.slice(-6),
    account: String(ctx.customer?.accountId || "").trim(), phone4: String(ctx.customer?.phone || "").replace(/\D/g, "").slice(-4)
  };
  const out = String(pattern).replace(/\{(\w+)\}/g, (m, k) => {
    if (!TOKENS.includes(k)) throw bad(`Unknown token {${k}}`);
    if (!values[k]) throw bad(`{${k}} has no value for this device`);
    return values[k];
  });
  if (!SSID_RE.test(out)) throw bad(`SSID "${out}" must be 1-32 printable characters`);
  return out;
}

const fiveFrom = ssid => `${ssid.slice(0, 29)}-5G`;

function coerce(value, type) {
  if (type === "xsd:boolean") {
    if ([true, "true", "1", 1].includes(value)) return true;
    if ([false, "false", "0", 0].includes(value)) return false;
    throw bad(`Boolean expected, got "${value}"`);
  }
  if (type === "xsd:unsignedInt" || type === "xsd:int") {
    const n = Number(value);
    if (!Number.isInteger(n) || (type === "xsd:unsignedInt" && n < 0)) throw bad(`Integer expected, got "${value}"`);
    return n;
  }
  const s = String(value ?? "");
  if (s.length > 256) throw bad("String values are limited to 256 characters");
  return s;
}

const SAMPLE = { serialNumber: "ABCD123456", macAddress: "00:11:22:33:44:55", customer: { accountId: "ACC1", phone: "9999912345" } };

function validateTemplate(body = {}, { partial = false } = {}) {
  const t = {};
  const has = k => body[k] !== undefined;
  if (!partial || has("name")) {
    t.name = String(body.name || "").trim();
    if (!t.name || t.name.length > 60) throw bad("Name is required (up to 60 characters)");
  }
  if (has("description")) t.description = String(body.description || "").trim().slice(0, 300);
  if (has("match")) t.match = { manufacturer: String(body.match?.manufacturer || "").trim(), productClass: String(body.match?.productClass || "").trim() };
  if (has("priority")) t.priority = Number.isInteger(Number(body.priority)) ? Number(body.priority) : 0;
  if (has("wifi")) {
    const w = body.wifi || {};
    t.wifi = { ssid: String(w.ssid || "").trim(), ssid5: String(w.ssid5 || "").trim(), password: w.password === "generate" ? "generate" : "keep" };
    for (const k of ["ssid", "ssid5"]) {
      if (!t.wifi[k]) continue;
      try {
        renderName(t.wifi[k], SAMPLE);
      } catch (err) {
        throw bad(`${k === "ssid" ? "SSID" : "5 GHz SSID"} pattern: ${err.message}`);
      }
    }
  }
  if (has("params")) {
    if (!Array.isArray(body.params) || body.params.length > 20) throw bad("Params must be a list of up to 20 entries");
    t.params = body.params.map(({ path, value, type = "xsd:string" }) => {
      path = String(path || "").trim();
      if (!PARAM_PATH.test(path)) throw bad(`Invalid parameter path "${path}"`);
      if (FORBIDDEN_PATH.test(path)) throw bad(`"${path}" is managed by the ACS and cannot be set from a template`);
      if (!TYPES.includes(type)) throw bad(`Type must be one of ${TYPES.join(", ")}`);
      return { path, value: coerce(value, type), type };
    });
  }
  if (has("tags")) t.tags = normTags(body.tags);
  if (has("isActive")) t.isActive = !!body.isActive;
  if (has("autoApplyToNew")) t.autoApplyToNew = !!body.autoApplyToNew;
  return t;
}

function assertAutoSafe(t) {
  if (t.autoApplyToNew && (t.wifi?.ssid || t.wifi?.ssid5 || t.wifi?.password === "generate")) {
    throw bad("Templates that change Wi-Fi can only be applied through pre-registration or manually, not to every new device");
  }
}

function matchTemplate(templates, device) {
  const score = t => {
    const m = t.match || {};
    if ((m.manufacturer && !ci(m.manufacturer, device.manufacturer)) || (m.productClass && !ci(m.productClass, device.productClass))) return -1;
    return (m.productClass ? 2 : 0) + (m.manufacturer ? 1 : 0);
  };
  return templates
    .filter(t => t.isActive !== false)
    .map(t => [score(t), t])
    .filter(([s]) => s >= 0)
    .sort((a, b) => b[0] - a[0] || (b[1].priority || 0) - (a[1].priority || 0))[0]?.[1] || null;
}

const bandKey = (radio, index, taken) => {
  if (/5/.test(radio.band || "") && !/2\.4/.test(radio.band || "")) return "5";
  if (/2\.4/.test(radio.band || "")) return "2.4";
  return index === 0 && !taken.has("2.4") ? "2.4" : null;
};

function primaryRadios(radios) {
  const out = new Map();
  radios.forEach((r, i) => {
    const key = bandKey(r, i, out);
    if (!key) return;
    const cur = out.get(key);
    if (!cur || (!cur.enabled && r.enabled)) out.set(key, r);
  });
  return out;
}

function plan(doc, template, { overrides = {}, ctx = {} } = {}) {
  const values = [], changes = [], skipped = [];
  let waiting = null;
  const push = (path, value, type, label) => {
    if (values.some(([p]) => p === path)) return;
    values.push([path, value, type]);
    changes.push(label);
  };

  const w = template.wifi || {};
  const ssid = overrides.ssid || (w.ssid ? renderName(w.ssid, ctx) : null);
  const ssid5 = overrides.ssid5 || (w.ssid5 ? renderName(w.ssid5, ctx) : ssid ? fiveFrom(ssid) : null);
  const password = overrides.password || null;
  if (w.password === "generate" && !password) skipped.push("Wi-Fi password: none generated");

  if (ssid || ssid5 || password) {
    const radios = primaryRadios(view.wifi(doc));
    if (!radios.size) waiting = "Wi-Fi interfaces not discovered yet";
    for (const [band, r] of radios) {
      const name = band === "5" ? ssid5 : ssid;
      if (name) {
        if (r.writePaths.ssid) push(r.writePaths.ssid, name, "xsd:string", `${band} GHz SSID → ${name}`);
        else skipped.push(`${band} GHz SSID: not writable`);
      }
      if (password) {
        if (r.writePaths.password) push(r.writePaths.password, password, "xsd:string", `${band} GHz password → (set)`);
        else skipped.push(`${band} GHz password: path not found`);
      }
    }
  }

  for (const prm of template.params || []) {
    if (get(doc, prm.path) === undefined) skipped.push(`${prm.path}: not on this device`);
    else push(prm.path, coerce(prm.value, prm.type), prm.type, `${prm.path} → ${prm.value}`);
  }
  return { values, changes, skipped, waiting };
}

module.exports = {
  SSID_RE, PSK_RE, generatePassword, normMac, normSerial, normTags, renderName, validateTemplate, assertAutoSafe, matchTemplate, primaryRadios, plan
};
