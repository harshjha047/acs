import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import api from "../lib/api";
import { ago, apiError, portName, ALERT_LABEL, SEVERITY_TONE, when } from "../lib/format";
import Shell from "../components/Shell";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import { useToast } from "../components/ui/Toast";

const TONE = { ok: "text-ok", warn: "text-warn", bad: "text-bad" };
const pctTone = (v, good, fair) => (v === null || v === undefined ? "" : v >= good ? "ok" : v >= fair ? "warn" : "bad");

function Tile({ label, value, tone, sub }) {
  return (
    <div className="rounded-card border border-line bg-white p-6">
      <div className="font-mono text-[11px] uppercase tracking-widest text-ink-3">{label}</div>
      <div className={`mt-2 text-5xl font-extrabold tabular-nums ${TONE[tone] || "text-plum"}`}>{value ?? "—"}</div>
      {sub && <div className="mt-1 text-xs text-ink-2">{sub}</div>}
    </div>
  );
}

export default function Noc() {
  const toast = useToast();
  const [d, setD] = useState(null);
  const load = useCallback(() => api.get("/noc").then(({ data }) => setD(data)).catch(err => toast(apiError(err, "Failed to load"), "bad")), [toast]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const full = () => document.documentElement.requestFullscreen?.().catch(() => {});
  const t = d?.totals;
  const incidents = (d?.ponOutages.length || 0) + (d?.clusters.length || 0);
  return (
    <Shell title="NOC wall">
      {!d && <p className="text-sm">Loading...</p>}
      {d && (
        <div className="grid gap-4">
          <div className="flex items-center justify-between font-mono text-[11px] text-ink-3">
            <span>Updated {when(d.monitor.lastRunAt)} · health scored {ago(d.intel.lastRunAt)}{d.intel.error && <span className="text-bad"> · intel error: {d.intel.error}</span>} · refresh 30 s</span>
            <button onClick={full} className="font-semibold text-plum underline">Full screen</button>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Tile label="Network health" value={d.networkHealthPct !== null ? `${d.networkHealthPct}%` : null} tone={pctTone(d.networkHealthPct, 85, 70)} sub="Avg device health score" />
            <Tile label="Availability" value={d.availabilityPct !== null ? `${d.availabilityPct}%` : null} tone={pctTone(d.availabilityPct, 98, 95)} sub={`${t.online} of ${t.online + t.offline} online`} />
            <Tile label="Offline" value={t.offline} tone={t.offline ? "bad" : "ok"} sub={`${t.devices} devices total`} />
            <Tile label="Active incidents" value={incidents} tone={incidents ? "bad" : "ok"} sub="PON outages + area clusters" />
            <Tile label="Critical alerts" value={t.alerts.critical || 0} tone={t.alerts.critical ? "bad" : "ok"} sub={`${t.alerts.warn || 0} warn`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Active outages" className={incidents ? "border-bad lg:col-span-2" : "lg:col-span-2"}>
              {!incidents && <p className="text-sm text-ink-2">No active outages.</p>}
              {d.ponOutages.map(a => (
                <div key={a._id} className="flex flex-wrap items-center gap-3 border-b border-line/60 py-3 last:border-0">
                  <Badge tone={SEVERITY_TONE[a.severity]}>PON</Badge>
                  <Link href={`/topology?port=${a.ponPort?._id}`} className="text-lg font-bold text-plum underline">{portName(a.ponPort)}</Link>
                  <span className="text-sm">{a.value?.offline}/{a.value?.total} offline</span>
                  <span className="ml-auto text-sm text-ink-2">since {ago(a.value?.since || a.openedAt)}</span>
                </div>
              ))}
              {d.clusters.map((c, i) => (
                <div key={i} className="flex flex-wrap items-center gap-3 border-b border-line/60 py-3 last:border-0">
                  <Badge tone="bad">Area</Badge>
                  <span className="text-lg font-bold text-plum">{c.count} devices</span>
                  <span className="text-sm text-ink-2">dropped {when(c.from)} – {when(c.to)} (not mapped to a PON)</span>
                </div>
              ))}
            </Card>
            <Card title="Device health">
              {["good", "fair", "poor", "offline"].map(k => (
                <div key={k} className="flex items-center justify-between border-b border-line/60 py-2 text-sm last:border-0">
                  <span className="capitalize">{k}</span>
                  <span className="text-xl font-extrabold tabular-nums text-plum">{d.health[k] || 0}</span>
                </div>
              ))}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Worst PON ports">
              {d.worstPorts.length === 0 ? <p className="text-sm text-ink-2">All mapped PONs fully online.</p> : d.worstPorts.map(p => (
                <Link key={String(p.ponPort)} href={`/topology?port=${p.ponPort}`} className="flex items-center justify-between border-b border-line/60 py-2 text-sm last:border-0">
                  <span className="font-semibold text-plum">{p.label}</span>
                  <span className={p.outage ? "font-bold text-bad" : "text-ink-2"}>{p.offline}/{p.total} offline</span>
                </Link>
              ))}
            </Card>
            <Card title="Open alerts by type">
              {d.alertsByType.length === 0 ? <p className="text-sm text-ink-2">All clear.</p> : d.alertsByType.sort((a, b) => b.n - a.n).map(a => (
                <div key={`${a.type}:${a.severity}`} className="flex items-center justify-between border-b border-line/60 py-2 text-sm last:border-0">
                  <span>{ALERT_LABEL[a.type] || a.type} <Badge tone={SEVERITY_TONE[a.severity]}>{a.severity}</Badge></span>
                  <span className="text-xl font-extrabold tabular-nums text-plum">{a.n}</span>
                </div>
              ))}
            </Card>
            <Card title="Latest critical">
              {d.critical.length === 0 ? <p className="text-sm text-ink-2">None.</p> : d.critical.map(a => (
                <div key={a._id} className="border-b border-line/60 py-2 text-sm last:border-0">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">{ALERT_LABEL[a.type] || a.type}</span>
                    <span className="text-xs text-ink-3">{ago(a.openedAt)}</span>
                  </div>
                  {a.device && <Link className="text-xs text-plum underline" href={`/devices/${a.device._id}`}>{a.device.customer?.name || a.device.pppoeUsername || a.device.serialNumber}</Link>}
                  <span className="ml-2 text-xs text-ink-2">{a.message}</span>
                </div>
              ))}
            </Card>
          </div>
        </div>
      )}
    </Shell>
  );
}
