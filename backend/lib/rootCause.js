const { thresholds } = require("./thresholds");

const has = v => v !== null && v !== undefined && Number.isFinite(Number(v));

function diagnose(x, th = thresholds()) {
  const m = x.mon || {};
  const out = [];
  const add = (code, title, confidence, evidence, action) => out.push({ code, title, confidence, evidence: evidence.filter(Boolean), action });
  const lowRx = x.verified && has(m.rxDbm) && m.rxDbm < th.rxWarn;
  const opticalOk = x.verified && has(m.rxDbm) && !lowRx;
  const pon = x.pon;

  if (x.online === false) {
    const lastRx = lowRx ? `Last Rx ${m.rxDbm} dBm before going offline` : null;
    if (pon?.outage) {
      add("pon_outage", "PON / feeder outage", 0.9,
        [`${pon.offline}/${pon.total} ONUs on ${pon.label} offline`, x.offlineMin !== null && `Offline ${x.offlineMin} min`],
        "Area fault: check the OLT port, feeder fiber and splitter. Not a customer-side problem.");
    } else if (pon && pon.total > 1) {
      add("cpe_local", "Customer-side: power or drop fiber", lastRx ? 0.8 : 0.7,
        [`${pon.total - pon.offline} of ${pon.total - 1} other ONUs on ${pon.label} are online`, lastRx, x.offlineMin !== null && `Offline ${x.offlineMin} min`],
        "Ask the customer about power and the LOS/PON light. If power is fine, check the drop fiber and patch cord.");
    } else {
      add("offline_unmapped", "Offline (area unknown)", 0.4,
        [x.offlineMin !== null && `Offline ${x.offlineMin} min`, lastRx, !pon && "Device is not mapped to a PON port"],
        "Import the OLT topology so the ACS can tell an area outage from a customer-side fault.");
    }
    return out;
  }

  if (lowRx) {
    add("optical_low", "Weak optical signal", m.rxDbm < th.rxCrit ? 0.85 : 0.7, [`Rx ${m.rxDbm} dBm (warn < ${th.rxWarn})`, has(x.rxDrop) && x.rxDrop > 0 && `Down ${x.rxDrop} dB in 24 h`],
      "Clean and re-seat connectors, check the drop fiber for tight bends, and check splitter loss.");
  } else if (x.verified && has(x.rxDrop) && x.rxDrop >= th.rxDropWarn) {
    add("optical_degrading", "Optical signal degrading", 0.65, [`Rx down ${x.rxDrop} dB in 24 h (now ${m.rxDbm} dBm)`],
      "Schedule a fiber check before it drops below the warning level.");
  }
  if (has(x.fecHour) && x.fecHour >= th.fecWarn) {
    add("fiber_errors", "Fiber errors (FEC)", 0.6, [`${x.fecHour} FEC errors in the last hour`, has(m.rxDbm) && `Rx ${m.rxDbm} dBm`],
      "Dirty connector or damaged fiber; inspect and clean the path.");
  }
  if (m.wanUp === false) {
    add("wan_down", "Internet down while fiber is up", opticalOk ? 0.8 : 0.6, [`WAN status ${m.wanStatus || "down"}`, opticalOk && `Optical OK (${m.rxDbm} dBm)`],
      "Check the PPPoE username/password, the RADIUS session and the BNG/VLAN for this customer.");
  }
  const ppp = Math.max(x.ppp1h || 0, Math.floor((x.ppp24 || 0) / 3));
  if (ppp >= th.pppFlap && !(x.boots24 > 0)) {
    add("pppoe_upstream", "PPPoE drops while ONU stays up", opticalOk ? 0.7 : 0.55, [`${x.ppp1h || 0} PPPoE reconnects in 1 h, ${x.ppp24 || 0} in 24 h`, "No ONU reboot in 24 h", opticalOk && "Optical OK"],
      "Upstream issue: check the BNG/RADIUS logs and session limits for this PPPoE user.");
  }
  if ((x.boots24 || 0) >= 2) {
    add("power_instability", "Unstable power or firmware crash", 0.6, [`${x.boots24} unexpected reboots in 24 h`],
      "Check the power adapter and wiring (UPS if frequent cuts). If power is fine, consider a firmware issue.");
  }
  if (has(m.tempC) && m.tempC >= th.tempWarn) {
    add("overheating", "ONU overheating", 0.6, [`Module at ${Math.round(m.tempC)} °C`], "Move the ONU out of enclosed or sunny spots; check ventilation.");
  }
  if (m.lan100 > 0) {
    add("lan_link", "LAN cable or device limited to 100 Mbps", 0.5, [`${m.lan100} LAN port${m.lan100 > 1 ? "s" : ""} at 100 Mbps`],
      "Replace the cable with Cat5e/Cat6, or check the connected device's port.");
  }
  if (!out.length) add("ok", "No problem detected", 1, [opticalOk && `Rx ${m.rxDbm} dBm`, m.wanUp && "Internet up"].filter(Boolean), null);
  return out.sort((a, b) => b.confidence - a.confidence);
}

module.exports = { diagnose };
