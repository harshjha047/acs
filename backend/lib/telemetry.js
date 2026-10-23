const { get, valueOf, expand, rootOf } = require("./tree");
const view = require("./deviceView");

const IGD = "InternetGatewayDevice";
const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const date = v => (v ? new Date(v) : null);
const ms = v => (v ? new Date(v).getTime() : null);
const usable = v => (v && v !== "0.0.0.0" ? v : null);

const PROJECTION = [
  "_deviceId", "_lastInform", "_lastBoot", "_registered",
  `${IGD}.DeviceInfo.UpTime`, `${IGD}.DeviceInfo.SoftwareVersion`, `${IGD}.ManagementServer.PeriodicInformInterval`,
  `${IGD}.WANDevice`, `${IGD}.X_ALU_OntOpticalParam`,
  "Device.DeviceInfo.UpTime", "Device.DeviceInfo.SoftwareVersion", "Device.ManagementServer.PeriodicInformInterval",
  "Device.Optical", "Device.PPP", "Device.IP.Interface"
];

const onlineWindowSec = interval => (interval || 300) * 2 + 120;
const isOnline = (lastInform, interval, now = Date.now()) => !!lastInform && (now - ms(lastInform)) / 1000 <= onlineWindowSec(interval);

function wanBytes(doc, wan) {
  const pair = (rx, tx) => (num(rx) === null && num(tx) === null ? null : { in: num(rx), out: num(tx) });
  if (wan?.path) {
    const s = get(doc, `${wan.path}.Stats`);
    const hit = pair(valueOf(s?.EthernetBytesReceived), valueOf(s?.EthernetBytesSent)) || pair(valueOf(s?.BytesReceived), valueOf(s?.BytesSent));
    if (hit) return hit;
  }
  if (rootOf(doc) === IGD) {
    const [, c] = expand(doc, `${IGD}.WANDevice.*.WANCommonInterfaceConfig`)[0] || [];
    return pair(valueOf(c?.TotalBytesReceived), valueOf(c?.TotalBytesSent));
  }
  return null;
}

function sample(doc, profile = {}) {
  const map = profile.parameterMap || {};
  const scalar = key => view.resolveScalar(doc, key, map).value;
  const rx = view.resolveOptical(doc, "rxPower", profile);
  const tx = view.resolveOptical(doc, "txPower", profile);
  const m = view.opticalModule(doc);
  const wan = view.primaryWan(view.wanConnections(doc));
  const bytes = wanBytes(doc, wan);
  return {
    lastInform: date(doc._lastInform),
    lastBoot: date(doc._lastBoot),
    registered: date(doc._registered),
    uptime: num(scalar("uptime")),
    informInterval: num(scalar("informInterval")) || 300,
    softwareVersion: scalar("softwareVersion") || null,
    rxDbm: rx.dbm,
    rxGrade: rx.grade,
    txDbm: tx.dbm,
    tempC: m?.temperatureC ?? null,
    fecErrors: m?.fecErrors ?? null,
    wanStatus: wan?.ConnectionStatus ?? null,
    wanUp: wan?.ConnectionStatus ? view.isUp(wan.ConnectionStatus) : null,
    wanIp: usable(wan?.ExternalIPAddress),
    pppUptime: wan?.kind === "PPPoE" ? num(wan.Uptime) : null,
    pppoeUsername: wan?.Username || null,
    macAddress: wan?.MACAddress ? String(wan.MACAddress).toLowerCase() : null,
    bytesIn: bytes?.in ?? null,
    bytesOut: bytes?.out ?? null
  };
}

function bootTime(prev, cur) {
  if (cur.lastBoot && ms(cur.lastBoot) > (ms(prev.lastBoot) || 0)) return cur.lastBoot;
  if (cur.uptime !== null && prev.uptime !== null && prev.uptime !== undefined && cur.uptime < prev.uptime && cur.lastInform) {
    return new Date(ms(cur.lastInform) - cur.uptime * 1000);
  }
  return null;
}

function detect(prev, cur) {
  if (!prev || !cur.lastInform || ms(prev.lastInform) === ms(cur.lastInform)) return [];
  const events = [];
  const at = cur.lastInform;
  const boot = bootTime(prev, cur);
  if (boot) events.push({ type: "boot", at: boot, details: { uptime: cur.uptime, previousInform: prev.lastInform || null } });
  if (prev.wanUp !== null && prev.wanUp !== undefined && cur.wanUp !== null && prev.wanUp !== cur.wanUp) {
    events.push({ type: cur.wanUp ? "wan_up" : "wan_down", at, details: { status: cur.wanStatus } });
  }
  if (!boot && prev.pppUptime !== null && prev.pppUptime !== undefined && cur.pppUptime !== null && cur.pppUptime < prev.pppUptime) {
    events.push({ type: "ppp_reconnect", at: new Date(ms(at) - cur.pppUptime * 1000), details: { previousUptime: prev.pppUptime } });
  }
  if (prev.wanIp && cur.wanIp && prev.wanIp !== cur.wanIp) events.push({ type: "ip_change", at, details: { from: prev.wanIp, to: cur.wanIp } });
  if (prev.softwareVersion && cur.softwareVersion && prev.softwareVersion !== cur.softwareVersion) {
    events.push({ type: "firmware_change", at, details: { from: prev.softwareVersion, to: cur.softwareVersion } });
  }
  return events;
}

const RX_WARN = () => Number(process.env.ALERT_RX_WARN_DBM ?? -27);
const RX_CRIT = () => Number(process.env.ALERT_RX_CRIT_DBM ?? -29);
const LOOP_COUNT = () => Number(process.env.ALERT_REBOOT_LOOP_COUNT ?? 3);

function alertsFor({ online, mon, verified, boots = 0, now = Date.now() }) {
  const out = [];
  if (!online && mon?.lastInform) {
    const mins = Math.round((now - ms(mon.lastInform)) / 60000);
    out.push({ type: "offline", severity: mins >= 60 ? "critical" : "warn", message: `Offline, last seen ${mins} min ago`, value: mins });
  }
  if (online && verified && mon?.rxDbm !== null && mon?.rxDbm !== undefined && mon.rxDbm < RX_WARN()) {
    out.push({ type: "low_rx", severity: mon.rxDbm < RX_CRIT() ? "critical" : "warn", message: `Low optical Rx ${mon.rxDbm} dBm`, value: mon.rxDbm });
  }
  if (boots >= LOOP_COUNT()) out.push({ type: "reboot_loop", severity: "critical", message: `${boots} reboots in the last hour`, value: boots });
  return out;
}

function series(points, max = 1500) {
  const step = Math.max(1, Math.ceil(points.length / max));
  const kept = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  const delta = (a, b) => (a === null || a === undefined || b === null || b === undefined || b < a ? null : b - a);
  return kept.map((p, i) => {
    const prev = kept[i - 1];
    const sec = prev ? (ms(p.at) - ms(prev.at)) / 1000 : null;
    const rate = key => {
      const d = prev && sec > 0 ? delta(prev[key], p[key]) : null;
      return d === null ? null : Math.round((d * 8) / sec / 1000);
    };
    return {
      at: p.at, rx: p.rx ?? null, tx: p.tx ?? null, temp: p.temp ?? null, wanUp: p.wanUp ?? null, pppUptime: p.pppUptime ?? null,
      fecDelta: prev ? delta(prev.fec, p.fec) : null,
      inKbps: rate("bytesIn"), outKbps: rate("bytesOut")
    };
  });
}

function clusters(offline, gapMin = 10, minSize = Number(process.env.OUTAGE_MIN_DEVICES ?? 3)) {
  const sorted = offline.filter(d => d.offlineSince).sort((a, b) => ms(a.offlineSince) - ms(b.offlineSince));
  const groups = [];
  for (const d of sorted) {
    const g = groups.at(-1);
    if (g && ms(d.offlineSince) - ms(g.to) <= gapMin * 60000) {
      g.to = d.offlineSince;
      g.devices.push(d._id);
    } else groups.push({ from: d.offlineSince, to: d.offlineSince, devices: [d._id] });
  }
  return groups.filter(g => g.devices.length >= minSize).map(g => ({ ...g, count: g.devices.length })).reverse();
}

module.exports = { PROJECTION, isOnline, onlineWindowSec, sample, detect, alertsFor, series, clusters, wanBytes };
