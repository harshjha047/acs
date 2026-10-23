import { useCallback, useEffect, useState } from "react";
import api from "../../lib/api";
import { apiError, when, EVENT_LABEL, EVENT_TONE, describeEvent } from "../../lib/format";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import LineChart from "../charts/LineChart";
import { useToast } from "../ui/Toast";

const RANGES = [[6, "6 h"], [24, "24 h"], [168, "7 d"], [720, "30 d"]];
const kbps = v => (v >= 1000 ? `${Math.round(v / 100) / 10} M` : `${v} k`);

export default function TrendsPanel({ deviceId }) {
  const toast = useToast();
  const [hours, setHours] = useState(24);
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    api.get(`/devices/${deviceId}/telemetry`, { params: { hours } }).then(({ data }) => setData(data)).catch(err => toast(apiError(err, "Failed to load trends"), "bad"));
  }, [deviceId, hours, toast]);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const pts = data?.points || [];
  const markers = (data?.events || []).filter(e => ["boot", "offline", "wan_down", "ppp_reconnect"].includes(e.type))
    .map(e => ({ at: e.at, label: `${EVENT_LABEL[e.type]} ${when(e.at)}`, color: e.type === "ppp_reconnect" ? "var(--color-amber)" : "var(--color-bad)" }));
  const has = key => pts.some(p => p[key] !== null);
  const empty = what => <p className="text-sm text-ink-2">{pts.length < 2 ? "Collecting: needs two samples (about 5-10 min)." : what}</p>;

  return (
    <div className="grid gap-4">
      <div className="flex gap-2">
        {RANGES.map(([h, label]) => (
          <button key={h} onClick={() => setHours(h)} className={`rounded-control px-3 py-1.5 text-sm font-semibold ${hours === h ? "bg-plum text-white" : "bg-white text-ink-2"}`}>{label}</button>
        ))}
        <span className="ml-auto self-center text-xs text-ink-2">{pts.length} samples · red lines: reboots / outages, amber: PPPoE reconnects</span>
      </div>
      {!data && <p className="text-sm">Loading...</p>}
      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Optical power (dBm, green = normal range)">
            {has("rx") || has("tx") ? (
              <div className="grid gap-4">
                {has("rx") && <LineChart points={pts} series={[{ key: "rx", label: "Rx" }]} unit="dBm" markers={markers} band={[-25, -8]} minSpan={3} />}
                {has("tx") && <LineChart points={pts} series={[{ key: "tx", label: "Tx", color: "var(--color-plum)" }]} unit="dBm" markers={markers} band={[0.5, 5]} minSpan={2} />}
              </div>
            ) : <p className="text-sm text-ink-2">Not reported.</p>}
          </Card>
          <Card title="Throughput (kbps, 5-min average)">
            {has("inKbps") ? <LineChart points={pts} series={[{ key: "inKbps", label: "Down" }, { key: "outKbps", label: "Up" }]} fmt={kbps} markers={markers} /> : empty("Device does not report WAN byte counters.")}
          </Card>
          <Card title="FEC errors per interval">
            {has("fecDelta") ? <LineChart points={pts} series={[{ key: "fecDelta", label: "FEC" }]} markers={markers} minSpan={10} /> : empty("Not reported.")}
          </Card>
          <Card title="Module temperature (°C)">
            {has("temp") ? <LineChart points={pts} series={[{ key: "temp", label: "Temp" }]} unit="°C" markers={markers} minSpan={5} /> : <p className="text-sm text-ink-2">Not reported.</p>}
          </Card>
        </div>
      )}
      {data && (
        <Card title="Device events">
          {data.events.length === 0 && <p className="text-sm text-ink-2">No events in this range.</p>}
          <ol className="flex flex-col">
            {data.events.map((e, i) => (
              <li key={i} className="flex gap-4 border-b border-line/60 py-2 last:border-0 text-sm">
                <span className="w-40 shrink-0 font-mono text-xs text-ink-3">{when(e.at)}</span>
                <Badge tone={EVENT_TONE[e.type] || "muted"}>{EVENT_LABEL[e.type] || e.type}</Badge>
                <span className="text-ink">{describeEvent(e)}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
