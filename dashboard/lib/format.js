export function duration(sec) {
  if (sec === null || sec === undefined || !Number.isFinite(Number(sec))) return "—";
  let s = Math.max(0, Math.round(Number(sec)));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : m ? `${m}m` : `${s}s`;
}

export const ago = date => (date ? `${duration((Date.now() - new Date(date)) / 1000)} ago` : "—");
export const when = date => (date ? new Date(date).toLocaleString() : "—");

export function bitrate(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return v || "—";
  return n >= 1000 ? `${n / 1000} Gbps` : `${n} Mbps`;
}

export const gradeTone = g => ({ ok: "ok", warn: "warn", bad: "bad" }[g] || "muted");

export function onlineState(device) {
  if (!device?.lastInformAt) return "unknown";
  const interval = device.informInterval || 300;
  return (Date.now() - new Date(device.lastInformAt)) / 1000 <= interval * 2 + 120 ? "online" : "offline";
}

export const apiError = (err, fallback) => err?.response?.data?.error || fallback;
