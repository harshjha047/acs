const { get, valueOf, rootOf, fields, expand } = require("./tree");
const { ROOTS } = require("./catalog");

const TRANSFER = ["DiagnosticsState", "ROMTime", "BOMTime", "EOMTime"];
const KINDS = {
  ping: { key: "ping", action: "ping", results: ["DiagnosticsState", "Host", "SuccessCount", "FailureCount", "AverageResponseTime", "MinimumResponseTime", "MaximumResponseTime"] },
  speed: { key: "download", action: "speed_test", results: [...TRANSFER, "DownloadURL", "TestBytesReceived", "TotalBytesReceived"] },
  upload: { key: "upload", action: "upload_test", results: [...TRANSFER, "UploadURL", "TestFileLength", "TestBytesSent", "TotalBytesSent"] },
  traceroute: { key: "traceroute", action: "traceroute", results: ["DiagnosticsState", "Host", "ResponseTime", "RouteHopsNumberOfEntries"], tree: true }
};

const baseOf = (doc, kind) => ROOTS[rootOf(doc)]?.[KINDS[kind].key] || null;
const supported = (doc, kind) => !!(baseOf(doc, kind) && get(doc, baseOf(doc, kind)));

function interfaceFor(doc, base, wanPath) {
  if (!wanPath || get(doc, `${base}.Interface`) === undefined) return null;
  if (rootOf(doc) === "Device" && !wanPath.startsWith("Device.IP.Interface.")) return null;
  return wanPath;
}

const uint = "xsd:unsignedInt";
const ARGS = {
  ping: (b, a) => [[`${b}.Host`, a.host, "xsd:string"], [`${b}.NumberOfRepetitions`, a.count, uint], [`${b}.Timeout`, 2000, uint]],
  speed: (b, a) => [[`${b}.DownloadURL`, a.url, "xsd:string"]],
  upload: (b, a) => [[`${b}.UploadURL`, a.url, "xsd:string"], [`${b}.TestFileLength`, a.bytes, uint]],
  traceroute: (b, a) => [[`${b}.Host`, a.host, "xsd:string"], [`${b}.NumberOfTries`, a.tries, uint], [`${b}.Timeout`, 3000, uint], [`${b}.MaxHopCount`, a.maxHops, uint]]
};

function request(doc, kind, args, wanPath) {
  const base = baseOf(doc, kind);
  if (!base) throw Object.assign(new Error("Unsupported data model"), { status: 422 });
  if (!get(doc, base)) throw Object.assign(new Error("This device does not expose this test. If the parameter tree is incomplete, run Fetch everything first."), { status: 422 });
  const values = ARGS[kind](base, args);
  const iface = interfaceFor(doc, base, wanPath);
  if (iface) values.push([`${base}.Interface`, iface, "xsd:string"]);
  values.push([`${base}.DiagnosticsState`, "Requested", "xsd:string"]);
  return values;
}

const resultPaths = (doc, kind) => {
  const base = baseOf(doc, kind);
  return base ? KINDS[kind].results.map(n => `${base}.${n}`).filter(p => get(doc, p) !== undefined) : [];
};

function liveTask(doc, kind) {
  const base = baseOf(doc, kind);
  if (!base) return null;
  if (KINDS[kind].tree) return { name: "refreshObject", objectName: base };
  const parameterNames = resultPaths(doc, kind);
  return parameterNames.length ? { name: "getParameterValues", parameterNames } : null;
}

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

function transfer(r, bytes) {
  const seconds = (Date.parse(r.EOMTime) - Date.parse(r.BOMTime)) / 1000;
  const ok = Number.isFinite(seconds) && seconds > 0;
  return {
    bytes,
    seconds: ok ? Math.round(seconds * 100) / 100 : null,
    mbps: ok && bytes > 0 ? Math.round((bytes * 8) / seconds / 1e4) / 100 : null
  };
}

function hops(doc, base) {
  return expand(doc, `${base}.RouteHops.*`)
    .sort(([a], [b]) => Number(a.split(".").pop()) - Number(b.split(".").pop()))
    .map(([path, n]) => {
      const pick = (...names) => names.map(k => valueOf(n[k])).find(v => v !== null && v !== undefined && v !== "") ?? null;
      const rtts = String(pick("HopRTTimes", "RTTimes") ?? "").split(",").map(num).filter(v => v !== null);
      const error = num(pick("HopErrorCode", "ErrorCode"));
      return {
        hop: Number(path.split(".").pop()),
        host: pick("HopHost", "Host"),
        address: pick("HopHostAddress", "HostAddress"),
        error: error || null,
        rtts,
        avgMs: rtts.length ? Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length) : null
      };
    });
}

function read(doc, kind) {
  const base = baseOf(doc, kind);
  const r = fields(get(doc, base || "") || {}, KINDS[kind].results);
  const raw = String(r.DiagnosticsState || "None");
  const state = /^complete/i.test(raw) ? "complete" : /^requested$/i.test(raw) ? "running" : /^error/i.test(raw) ? "error" : "idle";
  const checkedAt = get(doc, `${base}.DiagnosticsState`)?._timestamp || null;
  const head = { state, rawState: raw, checkedAt, supported: supported(doc, kind) };

  if (kind === "ping") {
    const ok = num(r.SuccessCount), bad = num(r.FailureCount);
    const sent = ok !== null && bad !== null ? ok + bad : null;
    return {
      ...head, host: r.Host, sent, received: r.SuccessCount,
      lossPct: sent ? Math.round((bad / sent) * 100) : null,
      avgMs: r.AverageResponseTime, minMs: r.MinimumResponseTime, maxMs: r.MaximumResponseTime
    };
  }
  if (kind === "traceroute") {
    const list = hops(doc, base);
    return { ...head, host: r.Host, responseMs: num(r.ResponseTime), hopCount: num(r.RouteHopsNumberOfEntries) ?? list.length, hops: list };
  }
  if (kind === "upload") return { ...head, url: r.UploadURL, ...transfer(r, num(r.TestBytesSent) || num(r.TestFileLength)) };
  return { ...head, url: r.DownloadURL, ...transfer(r, num(r.TestBytesReceived) || num(r.TotalBytesReceived)) };
}

const actionOf = kind => KINDS[kind].action;

module.exports = { KINDS, request, read, resultPaths, liveTask, baseOf, supported, actionOf };
