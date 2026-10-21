const { get, valueOf, rootOf, fields } = require("./tree");
const { ROOTS } = require("./catalog");

const KINDS = {
  ping: { key: "ping", results: ["DiagnosticsState", "Host", "SuccessCount", "FailureCount", "AverageResponseTime", "MinimumResponseTime", "MaximumResponseTime"] },
  speed: { key: "download", results: ["DiagnosticsState", "DownloadURL", "ROMTime", "BOMTime", "EOMTime", "TestBytesReceived", "TotalBytesReceived"] }
};

const baseOf = (doc, kind) => ROOTS[rootOf(doc)]?.[KINDS[kind].key] || null;

function interfaceFor(doc, base, wanPath) {
  if (!wanPath || get(doc, `${base}.Interface`) === undefined) return null;
  if (rootOf(doc) === "Device" && !wanPath.startsWith("Device.IP.Interface.")) return null;
  return wanPath;
}

function request(doc, kind, args, wanPath) {
  const base = baseOf(doc, kind);
  if (!base) throw Object.assign(new Error("Unsupported data model"), { status: 422 });
  const values = kind === "ping"
    ? [[`${base}.Host`, args.host, "xsd:string"], [`${base}.NumberOfRepetitions`, args.count, "xsd:unsignedInt"], [`${base}.Timeout`, 2000, "xsd:unsignedInt"]]
    : [[`${base}.DownloadURL`, args.url, "xsd:string"]];
  const iface = interfaceFor(doc, base, wanPath);
  if (iface) values.push([`${base}.Interface`, iface, "xsd:string"]);
  values.push([`${base}.DiagnosticsState`, "Requested", "xsd:string"]);
  return values;
}

const resultPaths = (doc, kind) => {
  const base = baseOf(doc, kind);
  return base ? KINDS[kind].results.map(n => `${base}.${n}`).filter(p => get(doc, p) !== undefined) : [];
};

function read(doc, kind) {
  const base = baseOf(doc, kind);
  const r = fields(get(doc, base || "") || {}, KINDS[kind].results);
  const raw = String(r.DiagnosticsState || "None");
  const state = /^complete/i.test(raw) ? "complete" : /^requested$/i.test(raw) ? "running" : /^error/i.test(raw) ? "error" : "idle";
  const checkedAt = get(doc, `${base}.DiagnosticsState`)?._timestamp || null;

  if (kind === "ping") {
    return {
      state, rawState: raw, checkedAt, host: r.Host,
      sent: r.SuccessCount !== null && r.FailureCount !== null ? Number(r.SuccessCount) + Number(r.FailureCount) : null,
      received: r.SuccessCount, lossPct: r.SuccessCount !== null && r.FailureCount !== null && Number(r.SuccessCount) + Number(r.FailureCount) > 0
        ? Math.round((Number(r.FailureCount) / (Number(r.SuccessCount) + Number(r.FailureCount))) * 100) : null,
      avgMs: r.AverageResponseTime, minMs: r.MinimumResponseTime, maxMs: r.MaximumResponseTime
    };
  }
  const bom = r.BOMTime ? Date.parse(r.BOMTime) : NaN;
  const eom = r.EOMTime ? Date.parse(r.EOMTime) : NaN;
  const bytes = Number(r.TestBytesReceived || r.TotalBytesReceived);
  const seconds = (eom - bom) / 1000;
  return {
    state, rawState: raw, checkedAt, url: r.DownloadURL,
    bytes: Number.isFinite(bytes) ? bytes : null,
    seconds: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 100) / 100 : null,
    mbps: Number.isFinite(seconds) && seconds > 0 && bytes > 0 ? Math.round((bytes * 8) / seconds / 1e4) / 100 : null
  };
}

module.exports = { request, read, resultPaths, baseOf };
