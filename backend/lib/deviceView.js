const { childKeys, get, valueOf, rootOf, expand, leaves, fields } = require("./tree");
const { SCALARS, OPTICAL, ROOTS } = require("./catalog");

const IGD = "InternetGatewayDevice";
const meaningful = v => v !== null && v !== undefined && v !== "" && v !== "0.0.0.0";
const lower = v => (typeof v === "string" ? v.toLowerCase() : v);
const toBool = v => v === true || v === 1 || v === "1" || v === "true";
const triBool = v => (v === null || v === undefined || v === "" ? null : toBool(v));
const firstKey = (node, re) => childKeys(node).find(k => re.test(k));

function pickPath(doc, candidates, preferred) {
  const pool = [...(preferred && get(doc, preferred) ? [preferred] : []), ...candidates.flatMap(p => expand(doc, p).map(([path]) => path))];
  const withValue = pool.find(p => meaningful(valueOf(get(doc, p))));
  return withValue || pool[0] || null;
}

function resolveScalar(doc, key, profileMap = {}) {
  const path = pickPath(doc, SCALARS[key], profileMap[key]);
  return { path, value: path ? valueOf(get(doc, path)) : null };
}

const UNIT_RULES = [
  [/OpticalSignalLevel|TransmitOpticalLevel/, "0.001dBm"],
  [/X_ZTE-COM|X_CT-COM|X_CU_/, "0.1uW"]
];

function toDbm(raw, path, unit) {
  const v = Number(raw);
  if (raw === null || raw === "" || !Number.isFinite(v)) return { dbm: null, unit: null, assumed: false };
  const rule = unit || UNIT_RULES.find(([re]) => re.test(path))?.[1];
  let resolvedUnit = rule;
  if (!resolvedUnit) resolvedUnit = v <= 10 && v >= -60 ? "dBm" : v < -60 && v >= -600 ? "0.1dBm" : v > 0 ? "0.1uW" : "dBm";
  const dbm = {
    dBm: v,
    "0.1dBm": v / 10,
    "0.001dBm": v / 1000,
    "0.1uW": v > 0 ? 10 * Math.log10(v / 10000) : null,
    uW: v > 0 ? 10 * Math.log10(v / 1000) : null
  }[resolvedUnit];
  return { dbm: dbm === null || dbm === undefined ? null : Math.round(dbm * 100) / 100, unit: resolvedUnit, assumed: !unit };
}

function gradeOptical(key, dbm) {
  if (dbm === null) return "unknown";
  if (key === "rxPower") return dbm > -7 || dbm < -28 ? "bad" : dbm > -8 || dbm < -25 ? "warn" : "ok";
  return dbm < 0 || dbm > 7 ? "bad" : dbm < 0.5 || dbm > 5 ? "warn" : "ok";
}

function resolveOptical(doc, key, profile = {}) {
  const spec = OPTICAL[key];
  let path = pickPath(doc, spec.paths, profile.parameterMap?.[key]);
  let source = path ? "catalog" : null;
  if (!path) {
    const root = rootOf(doc);
    const hit = root && leaves(doc[root], root).find(([p, n]) => spec.match.test(p) && meaningful(valueOf(n)));
    if (hit) [path, source] = [hit[0], "pattern"];
  }
  const raw = path ? valueOf(get(doc, path)) : null;
  const conv = toDbm(raw, path || "", profile.units?.[key]);
  return { path, source, raw, ...conv, grade: gradeOptical(key, conv.dbm) };
}

const isUp = s => ["connected", "up"].includes(lower(s));

function wanConnections(doc) {
  const root = rootOf(doc);
  if (root === IGD) {
    return ROOTS[IGD].wanConnections.flatMap(pattern => expand(doc, pattern).map(([path, node]) => {
      const serviceKey = firstKey(node, /servicelist/i);
      return {
        path,
        kind: path.includes("WANPPPConnection") ? "PPPoE" : "IP",
        ...fields(node, ["Name", "Enable", "ConnectionType", "ConnectionStatus", "ExternalIPAddress", "Username", "LastConnectionError", "MACAddress", "Uptime", "DefaultGateway", "DNSServers"]),
        services: serviceKey ? valueOf(node[serviceKey]) : null
      };
    }));
  }
  if (root === "Device") {
    const ipIfs = expand(doc, ROOTS.Device.ipInterfaces);
    const ipFor = path => {
      const hit = ipIfs.find(([, n]) => (valueOf(n.LowerLayers) || "").split(",").map(s => s.trim()).includes(path));
      return hit ? valueOf(expand(doc, `${hit[0]}.IPv4Address.*.IPAddress`)[0]?.[1]) : null;
    };
    const ppp = expand(doc, ROOTS.Device.pppInterfaces).map(([path, n]) => ({
      path, kind: "PPPoE",
      Name: valueOf(n.Name), Enable: valueOf(n.Enable), ConnectionStatus: valueOf(n.ConnectionStatus) || valueOf(n.Status),
      ExternalIPAddress: ipFor(path), Username: valueOf(n.Username), LastConnectionError: valueOf(n.LastConnectionError), services: null
    }));
    const ip = ipIfs
      .filter(([, n]) => !/lan|br-|bridge|loopback|^lo$/i.test(valueOf(n.Name) || "") && !(valueOf(n.LowerLayers) || "").includes("PPP"))
      .map(([path, n]) => ({
        path, kind: "IP",
        Name: valueOf(n.Name), Enable: valueOf(n.Enable), ConnectionStatus: valueOf(n.Status),
        ExternalIPAddress: valueOf(expand(doc, `${path}.IPv4Address.*.IPAddress`)[0]?.[1]), services: null
      }));
    return [...ppp, ...ip];
  }
  return [];
}

function primaryWan(list) {
  const internet = c => /internet/i.test(c.services || "") || /internet/i.test(c.Name || "") || c.kind === "PPPoE";
  return list.find(c => isUp(c.ConnectionStatus) && internet(c) && meaningful(c.ExternalIPAddress))
    || list.find(c => isUp(c.ConnectionStatus) && meaningful(c.ExternalIPAddress))
    || list.find(c => internet(c)) || list[0] || null;
}

const CT_RFBAND = { 0: "2.4 GHz", 1: "5 GHz" };

function bandOf(channel, standard, extra, extraKey) {
  if (extra !== null && extra !== undefined && extra !== "") {
    if (/X_CT-COM_RFBand/i.test(extraKey || "") && CT_RFBAND[Number(extra)]) return CT_RFBAND[Number(extra)];
    return /5/.test(String(extra)) ? "5 GHz" : /6/.test(String(extra)) ? "6 GHz" : "2.4 GHz";
  }
  const ch = Number(channel);
  if (ch > 14) return "5 GHz";
  if (ch >= 1) return "2.4 GHz";
  if (/ac|ax/i.test(standard || "") && !/[bg]/i.test(standard || "")) return "5 GHz";
  return null;
}

const existing = (doc, paths) => paths.find(p => get(doc, p) !== undefined) || null;

function wifi(doc) {
  const root = rootOf(doc);
  if (root === IGD) {
    return expand(doc, ROOTS[IGD].wlan).map(([path, n]) => {
      const bandKey = firstKey(n, /frequencyband|rfband|wlanfreq/i);
      const assoc = childKeys(n.AssociatedDevice).filter(k => /^\d+$/.test(k)).length;
      return {
        id: path,
        ssid: valueOf(n.SSID),
        enabled: triBool(valueOf(n.Enable)),
        status: valueOf(n.Status),
        channel: valueOf(n.Channel),
        autoChannel: triBool(valueOf(n.AutoChannelEnable)),
        standard: valueOf(n.Standard),
        hidden: valueOf(n.SSIDAdvertisementEnabled) === null ? null : !toBool(valueOf(n.SSIDAdvertisementEnabled)),
        security: valueOf(n.BeaconType),
        band: bandOf(valueOf(n.Channel), valueOf(n.Standard), bandKey && valueOf(n[bandKey]), bandKey),
        clients: valueOf(n.TotalAssociations) ?? assoc,
        writePaths: {
          ssid: n.SSID ? `${path}.SSID` : null,
          password: existing(doc, [`${path}.PreSharedKey.1.KeyPassphrase`, `${path}.KeyPassphrase`]),
          enabled: n.Enable ? `${path}.Enable` : null,
          channel: n.Channel ? `${path}.Channel` : null,
          autoChannel: n.AutoChannelEnable ? `${path}.AutoChannelEnable` : null,
          advertise: n.SSIDAdvertisementEnabled ? `${path}.SSIDAdvertisementEnabled` : null
        },
        writable: n.SSID?._writable ?? null
      };
    });
  }
  if (root === "Device") {
    const aps = expand(doc, ROOTS.Device.accessPoints);
    return expand(doc, ROOTS.Device.ssids).map(([path, n]) => {
      const radioPath = (valueOf(n.LowerLayers) || "").split(",")[0].trim().replace(/\.$/, "");
      const radio = radioPath ? get(doc, radioPath) : null;
      const ap = aps.find(([, a]) => (valueOf(a.SSIDReference) || "").replace(/\.$/, "") === path);
      const apPath = ap?.[0];
      return {
        id: path,
        ssid: valueOf(n.SSID),
        enabled: triBool(valueOf(n.Enable)),
        status: valueOf(n.Status),
        channel: valueOf(radio?.Channel),
        autoChannel: triBool(valueOf(radio?.AutoChannelEnable)),
        standard: valueOf(radio?.OperatingStandards),
        hidden: ap && valueOf(ap[1].SSIDAdvertisementEnabled) !== null ? !toBool(valueOf(ap[1].SSIDAdvertisementEnabled)) : null,
        security: valueOf(ap?.[1]?.Security?.ModeEnabled),
        band: bandOf(valueOf(radio?.Channel), null, valueOf(radio?.OperatingFrequencyBand)),
        clients: valueOf(ap?.[1]?.AssociatedDeviceNumberOfEntries) ?? childKeys(ap?.[1]?.AssociatedDevice).length,
        writePaths: {
          ssid: n.SSID ? `${path}.SSID` : null,
          password: apPath ? existing(doc, [`${apPath}.Security.KeyPassphrase`, `${apPath}.Security.PreSharedKey`]) : null,
          enabled: n.Enable ? `${path}.Enable` : null,
          channel: radio?.Channel ? `${radioPath}.Channel` : null,
          autoChannel: radio?.AutoChannelEnable ? `${radioPath}.AutoChannelEnable` : null,
          advertise: ap?.[1]?.SSIDAdvertisementEnabled ? `${apPath}.SSIDAdvertisementEnabled` : null
        },
        writable: n.SSID?._writable ?? null
      };
    });
  }
  return [];
}

const gradeSignal = s => (typeof s !== "number" || s >= 0 ? "unknown" : s >= -65 ? "ok" : s >= -75 ? "warn" : "bad");

function clients(doc) {
  const root = rootOf(doc);
  const radios = wifi(doc);
  const assoc = new Map();
  const addAssoc = (mac, data) => mac && assoc.set(mac.toLowerCase(), data);

  if (root === IGD) {
    for (const r of radios) {
      for (const [, a] of expand(doc, `${r.id}.AssociatedDevice.*`)) {
        const sigKey = firstKey(a, /rssi|signalstrength/i);
        const rateKey = firstKey(a, /datatransmitrate|txrate/i);
        addAssoc(valueOf(a.AssociatedDeviceMACAddress), {
          ip: valueOf(a.AssociatedDeviceIPAddress), signal: sigKey ? Number(valueOf(a[sigKey])) : null,
          rate: rateKey ? valueOf(a[rateKey]) : null, ssid: r.ssid, band: r.band
        });
      }
    }
  } else if (root === "Device") {
    for (const [apPath, ap] of expand(doc, ROOTS.Device.accessPoints)) {
      const ssidPath = (valueOf(ap.SSIDReference) || "").replace(/\.$/, "");
      const radio = radios.find(r => r.id === ssidPath);
      for (const [, a] of expand(doc, `${apPath}.AssociatedDevice.*`)) {
        addAssoc(valueOf(a.MACAddress), {
          ip: null, signal: valueOf(a.SignalStrength) === null ? null : Number(valueOf(a.SignalStrength)),
          rate: valueOf(a.LastDataDownlinkRate), ssid: radio?.ssid, band: radio?.band
        });
      }
    }
  }

  const rows = [];
  const seen = new Set();
  for (const [, h] of expand(doc, ROOTS[root]?.hosts || "")) {
    const mac = (valueOf(h.MACAddress) || valueOf(h.PhysAddress) || "").toLowerCase();
    const link = valueOf(h.Layer2Interface) || valueOf(h.Layer1Interface) || valueOf(h.InterfaceType) || "";
    const w = assoc.get(mac);
    seen.add(mac);
    rows.push({
      name: valueOf(h.HostName) || null,
      ip: valueOf(h.IPAddress) || w?.ip || null,
      mac: mac || null,
      active: valueOf(h.Active) === null ? null : toBool(valueOf(h.Active)),
      via: w || /wlan|wifi|802\.11/i.test(link) ? "wifi" : /ethernet|lan/i.test(link) ? "ethernet" : "unknown",
      port: /LANEthernetInterfaceConfig\.(\d+)|Ethernet\.Interface\.(\d+)/.exec(link)?.slice(1).find(Boolean) || null,
      ssid: w?.ssid || radios.find(r => link === r.id || link.startsWith(`${r.id}.`))?.ssid || null,
      band: w?.band || radios.find(r => link === r.id || link.startsWith(`${r.id}.`))?.band || null,
      signal: Number.isFinite(w?.signal) ? w.signal : null,
      signalGrade: gradeSignal(w?.signal),
      rate: w?.rate ?? null,
      source: valueOf(h.AddressSource)
    });
  }
  for (const [mac, w] of assoc) {
    if (!seen.has(mac)) rows.push({ name: null, ip: w.ip, mac, active: true, via: "wifi", port: null, ssid: w.ssid, band: w.band, signal: w.signal, signalGrade: gradeSignal(w.signal), rate: w.rate, source: null });
  }
  return rows.sort((a, b) => (b.active === true) - (a.active === true));
}

function lanPorts(doc) {
  const root = rootOf(doc);
  if (!ROOTS[root]) return [];
  return expand(doc, ROOTS[root].lanPorts)
    .filter(([, n]) => !toBool(valueOf(n.Upstream)))
    .map(([path, n], i) => ({
      id: path,
      label: valueOf(n.Name) || `LAN ${path.split(".").pop() || i + 1}`,
      enabled: valueOf(n.Enable) === null ? null : toBool(valueOf(n.Enable)),
      status: valueOf(n.Status),
      up: isUp(valueOf(n.Status)),
      speed: valueOf(n.CurrentBitRate) ?? valueOf(n.MaxBitRate),
      duplex: valueOf(n.DuplexMode)
    }));
}

function summary(doc, profile = {}) {
  const map = profile.parameterMap || {};
  const scalar = Object.fromEntries(Object.keys(SCALARS).map(k => [k, resolveScalar(doc, k, map)]));
  const lastInform = doc._lastInform ? new Date(doc._lastInform) : null;
  const interval = Number(scalar.informInterval.value) || 300;
  const ageSec = lastInform ? Math.round((Date.now() - lastInform) / 1000) : null;
  const uptime = Number(scalar.uptime.value);
  const connections = wanConnections(doc);
  const radios = wifi(doc);
  const hostRows = clients(doc);
  const ports = lanPorts(doc);
  const id = doc._deviceId || {};

  return {
    root: rootOf(doc),
    lastInform,
    registered: doc._registered || null,
    online: { state: ageSec === null ? "unknown" : ageSec <= interval * 2 + 120 ? "online" : "offline", ageSec, interval },
    identity: {
      manufacturer: id._Manufacturer || null, oui: id._OUI || null, productClass: id._ProductClass || null, serialNumber: id._SerialNumber || null,
      softwareVersion: scalar.softwareVersion.value, hardwareVersion: scalar.hardwareVersion.value, modelName: scalar.modelName.value
    },
    uptime: Number.isFinite(uptime) ? uptime : null,
    lastBoot: lastInform && Number.isFinite(uptime) ? new Date(lastInform - uptime * 1000) : null,
    connectionRequestUrl: scalar.connectionRequestUrl.value,
    wan: { primary: primaryWan(connections), connections },
    optical: { rxPower: resolveOptical(doc, "rxPower", profile), txPower: resolveOptical(doc, "txPower", profile) },
    wifi: radios.map(({ writePaths, ...r }) => r),
    counts: {
      clients: hostRows.length,
      activeClients: hostRows.filter(h => h.active !== false).length,
      wifiClients: hostRows.filter(h => h.via === "wifi" && h.active !== false).length,
      lanPortsUp: ports.filter(p => p.up).length
    },
    resolved: {
      ...Object.fromEntries(Object.entries(scalar).map(([k, v]) => [k, v.path])),
      rxPower: null, txPower: null
    }
  };
}

function learnedMap(s) {
  const map = { ...s.resolved, rxPower: s.optical.rxPower.path, txPower: s.optical.txPower.path };
  return Object.fromEntries(Object.entries(map).filter(([, v]) => v));
}

const isPrivate = url => /\/\/(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(url || "");

function readiness(doc, s) {
  const root = rootOf(doc);
  const allLeaves = root ? leaves(doc[root], root) : [];
  const leafCount = allLeaves.length;
  const valued = allLeaves.filter(([, n]) => n._value !== undefined).length;
  const valuedPct = leafCount ? Math.round((valued / leafCount) * 100) : 0;
  const radios = wifi(doc);
  const hostRows = clients(doc);
  const ports = lanPorts(doc);
  const primary = s.wan.primary;
  const item = (feature, status, detail, path = null) => ({ feature, status, detail, path });
  const vendorExt = [...new Set(leaves(doc[root] || {}, root || "").map(([p]) => /\.(X_[A-Za-z0-9-]+?)_/.exec(p)?.[1]).filter(Boolean))];

  const items = [
    item("Data model", root ? "ok" : "bad", root || "No root object"),
    item("Full parameter tree fetched", leafCount > 100 ? "ok" : "warn", `${leafCount} parameters`, null),
    item("Parameter values fetched", valuedPct >= 80 ? "ok" : "warn", `${valued} of ${leafCount} (${valuedPct}%)${valuedPct < 80 ? ": run Fetch everything; if it stays low, check cwmp logs for faults" : ""}`),
    item("Firmware version", meaningful(s.identity.softwareVersion) ? "ok" : "warn", s.identity.softwareVersion || "Not found", s.resolved.softwareVersion),
    item("Uptime / last boot", s.uptime !== null ? "ok" : "warn", s.uptime !== null ? `${s.uptime}s` : "Not found", s.resolved.uptime),
    item("WAN connections", s.wan.connections.length ? "ok" : "bad", `${s.wan.connections.length} found`),
    item("Internet WAN up", primary && isUp(primary.ConnectionStatus) ? "ok" : "warn", primary ? `${primary.kind} ${primary.Name || ""} ${primary.ConnectionStatus || ""} ${primary.ExternalIPAddress || ""}`.trim() : "None", primary?.path),
    item("PPPoE username", meaningful(primary?.Username) ? "ok" : "warn", primary?.Username || "Not found (IPoE or not exposed)"),
    item("Optical Rx power", s.optical.rxPower.dbm !== null ? (s.optical.rxPower.assumed ? "warn" : "ok") : "bad",
      s.optical.rxPower.dbm !== null ? `${s.optical.rxPower.dbm} dBm from raw ${s.optical.rxPower.raw} (${s.optical.rxPower.unit}${s.optical.rxPower.assumed ? ", unit assumed: compare with ONT web UI" : ""})` : "Not found", s.optical.rxPower.path),
    item("Optical Tx power", s.optical.txPower.dbm !== null ? (s.optical.txPower.assumed ? "warn" : "ok") : "warn",
      s.optical.txPower.dbm !== null ? `${s.optical.txPower.dbm} dBm from raw ${s.optical.txPower.raw} (${s.optical.txPower.unit})` : "Not found", s.optical.txPower.path),
    item("Wi-Fi SSIDs", radios.length ? "ok" : "bad", `${radios.length} found, ${radios.filter(r => r.enabled === true).length} enabled${radios.some(r => r.enabled === null) ? `, ${radios.filter(r => r.enabled === null).length} unknown` : ""}`),
    item("Wi-Fi SSID writable", radios.some(r => r.writable) ? "ok" : "warn", radios.some(r => r.writable) ? "Yes" : "Unknown or read-only"),
    item("Wi-Fi password path", radios.some(r => r.writePaths.password) ? "ok" : "bad", radios.find(r => r.writePaths.password)?.writePaths.password || "Not found"),
    item("Connected clients", hostRows.length ? "ok" : "warn", `${hostRows.length} hosts`),
    item("Wi-Fi client signal", hostRows.some(h => h.signal !== null) ? "ok" : "warn", hostRows.some(h => h.signal !== null) ? "RSSI available" : "No RSSI field found"),
    item("LAN ports", ports.length ? "ok" : "warn", `${ports.length} ports, ${ports.filter(p => p.up).length} up`),
    item("Ping diagnostics", get(doc, ROOTS[root]?.ping || "") ? "ok" : "warn", ROOTS[root]?.ping || "-"),
    item("Speed test (TR-143)", get(doc, ROOTS[root]?.download || "") ? "ok" : "warn", ROOTS[root]?.download || "-"),
    item("Connection request (instant actions)", s.connectionRequestUrl && !isPrivate(s.connectionRequestUrl) ? "ok" : "warn",
      s.connectionRequestUrl ? `${s.connectionRequestUrl}${isPrivate(s.connectionRequestUrl) ? " (private IP: actions wait for next inform unless ACS can reach it)" : ""}` : "Not reported"),
    item("Inform interval", Number(s.online.interval) <= 600 ? "ok" : "warn", `${s.online.interval}s`)
  ];

  const opticalCandidates = root ? leaves(doc[root], root)
    .filter(([p]) => OPTICAL.rxPower.match.test(p) || OPTICAL.txPower.match.test(p) || /optical|[gex]pon|(^|[._])pon/i.test(p))
    .slice(0, 50).map(([p, n]) => ({ path: p, value: valueOf(n) })) : [];

  return { items, leafCount, vendorExtensions: vendorExt, opticalCandidates };
}

module.exports = { summary, wifi, clients, lanPorts, wanConnections, readiness, learnedMap, resolveOptical, toDbm, gradeOptical };
