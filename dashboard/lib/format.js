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
export const errTone = err => ([409, 429].includes(err?.response?.status) ? "warn" : "bad");

export const EVENT_LABEL = {
  registered: "Registered with ACS", boot: "Booted", online: "Back online", offline: "Went offline", wan_up: "WAN up", wan_down: "WAN down",
  ppp_reconnect: "PPPoE reconnected", ip_change: "WAN IP changed", firmware_change: "Firmware changed"
};
export const EVENT_TONE = { boot: "warn", offline: "bad", wan_down: "bad", online: "ok", wan_up: "ok", ppp_reconnect: "warn", firmware_change: "warn" };

export function describeEvent(e) {
  const d = e.details || {};
  if (e.type === "boot" || e.event === "boot") return d.cause === "acs_reboot" ? `After ACS reboot · down ${duration(d.downtimeSec)}` : "Unexpected (power cut or crash)";
  if (d.from || d.to) return `${d.from ?? "—"} → ${d.to ?? "—"}`;
  if (d.previousUptime) return `Session was up ${duration(d.previousUptime)}`;
  if (d.lastInform) return `Last seen ${when(d.lastInform)}`;
  return d.status || d.serialNumber || "";
}

export const ALERT_LABEL = {
  offline: "Offline", low_rx: "Low Rx", reboot_loop: "Reboot loop", unknown_device: "New device", optical_degrading: "Rx degrading", high_temp: "High temperature",
  high_fec: "Fiber errors", wan_flapping: "WAN flapping", ppp_flapping: "PPPoE flapping", lan_100m: "LAN at 100M", pon_outage: "PON outage", firmware_changed: "Firmware changed"
};
export const HEALTH_TONE = { good: "ok", fair: "warn", poor: "bad", offline: "bad" };
export const portName = p => (p ? `${p.olt?.name || "OLT"} ${p.label || [p.slot, p.port].filter(Boolean).join("/")}` : "—");
export const SEVERITY_TONE = { critical: "bad", warn: "warn", info: "muted" };

export const ACTION_LABEL = {
  diagnostics_view: "Viewed diagnostics", reboot: "Reboot", factory_reset: "Factory reset", wifi_update: "Wi-Fi change", firmware_push: "Firmware push", device_remove: "Removed from ACS",
  auto_provision: "Auto-provision", refresh: "Refresh", ping: "Ping test", traceroute: "Traceroute", speed_test: "Download test", upload_test: "Upload test", capture: "Capture", customer_link: "Customer linked",
  tag_update: "Tags changed", secret_view: "Viewed Wi-Fi password"
};

export const PROV_TONE = { pending: "warn", queued: "warn", applied: "ok", failed: "bad" };
export const PROV_LABEL = { pending: "Provisioning: waiting for data", queued: "Provisioning: queued", applied: "Provisioned", failed: "Provisioning failed" };
export const FW_TONE = { queued: "warn", sent: "warn", downloading: "warn", rebooting: "warn", applied: "ok", failed: "bad", skipped: "muted" };
export const FW_LABEL = { queued: "Queued", sent: "Waiting for check-in", downloading: "Downloading", rebooting: "Rebooting", applied: "Applied", failed: "Failed", skipped: "Skipped" };
export const ROLLOUT_TONE = { draft: "muted", running: "warn", paused: "warn", halted: "bad", done: "ok" };
export const input = "h-11 w-full rounded-control border border-line bg-white px-4 text-sm outline-none focus:border-plum";
