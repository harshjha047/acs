const { thresholds } = require("./thresholds");

const has = v => v !== null && v !== undefined && Number.isFinite(Number(v));
const round1 = v => Math.round(v * 10) / 10;

const counterDelta = (first, last) => (!has(first) || !has(last) ? null : last >= first ? last - first : last);

function rxDrop(oldAvg, curAvg) {
  return has(oldAvg) && has(curAvg) ? round1(oldAvg - curAvg) : null;
}

const INTEL_DEVICE_TYPES = ["optical_degrading", "high_temp", "high_fec", "wan_flapping", "ppp_flapping", "lan_100m", "firmware_changed"];

function deviceAlerts(x, th = thresholds()) {
  const out = [];
  const add = (type, severity, message, value) => out.push({ type, severity, message, value });
  const mon = x.mon || {};
  if (x.online && x.verified && has(x.rxDrop) && x.rxDrop >= th.rxDropWarn) {
    add("optical_degrading", x.rxDrop >= th.rxDropCrit ? "critical" : "warn", `Rx dropped ${x.rxDrop} dB vs 24 h ago (now ${mon.rxDbm ?? "?"} dBm)`, x.rxDrop);
  }
  if (x.online && has(mon.tempC) && mon.tempC >= th.tempWarn) {
    add("high_temp", mon.tempC >= th.tempCrit ? "critical" : "warn", `Optical module at ${round1(mon.tempC)} °C`, mon.tempC);
  }
  if (x.online && has(x.fecHour) && x.fecHour >= th.fecWarn) {
    add("high_fec", x.fecHour >= th.fecCrit ? "critical" : "warn", `${x.fecHour} FEC errors in the last hour`, x.fecHour);
  }
  if ((x.wanDown1h || 0) >= th.wanFlap) add("wan_flapping", "warn", `WAN went down ${x.wanDown1h} times in the last hour`, x.wanDown1h);
  if ((x.ppp1h || 0) >= th.pppFlap) add("ppp_flapping", "warn", `PPPoE reconnected ${x.ppp1h} times in the last hour`, x.ppp1h);
  if (x.online && mon.lan100 > 0) add("lan_100m", "info", `${mon.lan100} LAN port${mon.lan100 > 1 ? "s" : ""} linked at 100 Mbps`, mon.lan100);
  if (x.unexpectedFirmware) {
    const { from, to } = x.unexpectedFirmware;
    add("firmware_changed", "info", `Firmware changed outside the ACS: ${from ?? "?"} → ${to ?? "?"}`, { from, to });
  }
  return out;
}

function ponOutage(port, th = thresholds()) {
  if (!port.total || port.offline < th.ponMin || port.offline / port.total < th.ponRatio) return null;
  const ratio = port.offline / port.total;
  return {
    type: "pon_outage",
    ponPort: port.ponPort,
    severity: ratio >= 0.8 ? "critical" : "warn",
    message: `${port.offline}/${port.total} ONUs offline on ${port.label}`,
    value: { offline: port.offline, total: port.total, since: port.since || null },
    affected: port.offline,
    cause: {
      code: ratio >= 0.8 ? "feeder_or_olt" : "branch_or_splitter",
      confidence: Math.min(0.95, 0.5 + ratio / 2),
      evidence: [`${port.offline} of ${port.total} mapped ONUs offline`, ...(port.since ? [`first drop ${new Date(port.since).toISOString()}`] : [])]
    }
  };
}

module.exports = { INTEL_DEVICE_TYPES, deviceAlerts, ponOutage, counterDelta, rxDrop };
