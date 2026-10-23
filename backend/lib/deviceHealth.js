const { thresholds } = require("./thresholds");

const WEIGHTS = { optical: 35, internet: 25, stability: 25, ethernet: 15 };
const clamp = v => Math.max(0, Math.min(100, Math.round(v)));
const has = v => v !== null && v !== undefined && Number.isFinite(Number(v));
const lerp = (x, x0, x1, y0, y1) => y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);

function rxScore(rx, th) {
  if (rx >= th.rxWarn + 3) return 100;
  if (rx >= th.rxWarn) return lerp(rx, th.rxWarn, th.rxWarn + 3, 60, 100);
  if (rx >= th.rxCrit) return lerp(rx, th.rxCrit, th.rxWarn, 25, 60);
  return 10;
}

function optical(x, th) {
  const m = x.mon || {};
  if (!x.verified || !has(m.rxDbm)) return null;
  let score = rxScore(m.rxDbm, th);
  const notes = [`Rx ${m.rxDbm} dBm`];
  if (has(m.tempC) && m.tempC >= th.tempWarn) { score -= m.tempC >= th.tempCrit ? 40 : 20; notes.push(`${Math.round(m.tempC)} °C`); }
  if (has(x.rxDrop) && x.rxDrop >= th.rxDropWarn) { score -= 15; notes.push(`−${x.rxDrop} dB in 24 h`); }
  if (has(x.fecHour) && x.fecHour >= th.fecWarn) { score -= 20; notes.push(`${x.fecHour} FEC/h`); }
  return { score: clamp(score), note: notes.join(" · ") };
}

function internet(x) {
  const up = x.mon?.wanUp;
  if (up === null || up === undefined) return null;
  return up ? { score: 100, note: "Connected" } : { score: 0, note: "Internet down" };
}

function stability(x) {
  const boots = x.boots24 || 0, ppp = x.ppp24 || 0, wan = x.wanDown24 || 0;
  const parts = [boots && `${boots} unexpected reboot${boots > 1 ? "s" : ""}`, ppp && `${ppp} PPPoE drop${ppp > 1 ? "s" : ""}`, wan && `${wan} WAN down`].filter(Boolean);
  return { score: clamp(100 - 25 * boots - 10 * ppp - 10 * wan), note: parts.length ? `${parts.join(", ")} in 24 h` : "Stable 24 h" };
}

function ethernet(x) {
  const m = x.mon || {};
  if (!m.lanUp) return null;
  return m.lan100 > 0 ? { score: 70, note: `${m.lan100} port${m.lan100 > 1 ? "s" : ""} at 100 Mbps` } : { score: 100, note: `${m.lanUp} port${m.lanUp > 1 ? "s" : ""} up` };
}

const statusOf = s => (s >= 80 ? "good" : s >= 50 ? "fair" : "poor");

function score(x, th = thresholds()) {
  if (x.online === null || x.online === undefined) return null;
  const components = { optical: optical(x, th), internet: internet(x), stability: stability(x), ethernet: ethernet(x) };
  if (!x.online) return { score: 0, status: "offline", components };
  const used = Object.entries(components).filter(([, c]) => c);
  const weight = used.reduce((n, [k]) => n + WEIGHTS[k], 0);
  let total = clamp(used.reduce((n, [k, c]) => n + c.score * WEIGHTS[k], 0) / weight);
  if (components.internet?.score === 0) total = Math.min(total, 40);
  return { score: total, status: statusOf(total), components };
}

module.exports = { score, WEIGHTS, statusOf };
