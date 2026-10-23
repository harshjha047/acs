const COLUMNS = ["pop", "olt", "olt_vendor", "olt_model", "olt_ip", "pon_type", "pon", "onu_id", "serial", "mac", "pppoe",
  "account", "customer_name", "phone", "service_id", "plan", "vlan", "splitter", "status"];
const ALIASES = { olt_name: "olt", pon_port: "pon", onu: "onu_id", serial_number: "serial", sn: "serial", mac_address: "mac", pppoe_username: "pppoe", username: "pppoe", account_id: "account", customer: "customer_name", name: "customer_name" };
const PON_TYPES = ["EPON", "GPON", "XGS"];
const STATUSES = ["pending", "active", "suspended", "terminated"];

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = String(text).replace(/^\uFEFF/, "");
  const first = src.split(/\r?\n/, 1)[0];
  const delim = [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(f => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(f => f.trim() !== "")) rows.push(row);
  return rows;
}

const headerKey = h => {
  const k = String(h).trim().toLowerCase().replace(/[\s-]+/g, "_");
  return ALIASES[k] || k;
};

function normMac(v) {
  const hex = String(v || "").toLowerCase().replace(/[^0-9a-f]/g, "");
  return hex.length === 12 ? hex.match(/../g).join(":") : null;
}

function parsePon(pon, onuId) {
  const src = String(pon || "").trim() || String(onuId || "").split(":")[0].trim();
  if (!src) return null;
  const m = src.match(/^([A-Za-z-]*)\s*(\d+)\s*\/\s*(\d+)(?:\s*\/\s*(\d+))?$/);
  if (m) return m[4] ? { slot: `${m[2]}/${m[3]}`, port: m[4], label: src } : { slot: m[2], port: m[3], label: src };
  return { slot: "", port: src, label: src };
}

function normalize(records) {
  if (!records.length) return { rows: [], errors: [{ line: 1, error: "Empty file" }], unknownColumns: [] };
  const header = records[0].map(headerKey);
  const unknownColumns = header.filter(h => h && !COLUMNS.includes(h));
  if (!header.includes("olt")) return { rows: [], errors: [{ line: 1, error: "Missing column: olt" }], unknownColumns };
  const rows = [], errors = [];
  records.slice(1).forEach((rec, i) => {
    const line = i + 2;
    const r = Object.fromEntries(header.map((h, j) => [h, String(rec[j] ?? "").trim()]).filter(([h]) => COLUMNS.includes(h)));
    const problems = [];
    if (!r.olt) problems.push("olt is empty");
    const pon = parsePon(r.pon, r.onu_id);
    if (!pon) problems.push("pon (or onu_id like EPON0/1:29) is empty");
    if (!r.onu_id && !r.serial && !r.mac && !r.pppoe && !r.service_id) problems.push("need one of onu_id, serial, mac, pppoe, service_id");
    const mac = r.mac ? normMac(r.mac) : null;
    if (r.mac && !mac) problems.push(`bad mac "${r.mac}"`);
    const ponType = r.pon_type ? r.pon_type.toUpperCase() : (pon?.label.match(/^(EPON|GPON|XGS)/i)?.[1] || "").toUpperCase() || null;
    if (ponType && !PON_TYPES.includes(ponType)) problems.push(`pon_type must be ${PON_TYPES.join("/")}`);
    const status = r.status ? r.status.toLowerCase() : null;
    if (status && !STATUSES.includes(status)) problems.push(`status must be ${STATUSES.join("/")}`);
    if (problems.length) return errors.push({ line, error: problems.join("; ") });
    const onuId = r.onu_id || null;
    rows.push({
      line,
      pop: r.pop || null,
      olt: { name: r.olt, vendor: r.olt_vendor || null, model: r.olt_model || null, mgmtIp: r.olt_ip || null, ponType },
      pon,
      onuId,
      serial: r.serial ? r.serial.toUpperCase() : null,
      mac,
      pppoe: r.pppoe || null,
      account: r.account || null,
      customerName: r.customer_name || null,
      phone: r.phone || null,
      serviceId: r.service_id || r.pppoe || (onuId && `${r.olt}/${onuId}`) || r.serial?.toUpperCase() || mac,
      plan: r.plan || null,
      vlan: r.vlan || null,
      splitter: r.splitter || null,
      status
    });
  });
  const seen = new Map();
  for (const r of rows) {
    if (seen.has(r.serviceId)) errors.push({ line: r.line, error: `duplicate service ${r.serviceId} (also line ${seen.get(r.serviceId)})` });
    else seen.set(r.serviceId, r.line);
  }
  const dupLines = new Set(errors.map(e => e.line));
  return { rows: rows.filter(r => !dupLines.has(r.line)), errors: errors.sort((a, b) => a.line - b.line), unknownColumns };
}

const portLabel = (port, olt) => `${olt?.name || "OLT"} ${port.label || [port.slot, port.port].filter(Boolean).join("/")}`;

module.exports = { COLUMNS, parseCsv, normalize, normMac, parsePon, portLabel };
