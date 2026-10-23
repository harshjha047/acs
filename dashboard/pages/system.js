import { useCallback, useEffect, useState } from "react";
import api from "../lib/api";
import { apiError, duration, when } from "../lib/format";
import Shell from "../components/Shell";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";

const LABEL = {
  database: "App database", nbi: "GenieACS NBI", cwmp: "CWMP (device port)", fileServer: "File server", monitor: "Monitor loop",
  faults: "Device faults", taskQueue: "Task queue", backup: "Latest backup", disk: "Disk", memory: "Memory"
};
const TEXT = { ok: "Healthy", warn: "Degraded", bad: "Down" };

export default function System() {
  const toast = useToast();
  const [data, setData] = useState(null);

  const load = useCallback(() => api.get("/system/health").then(r => setData(r.data)).catch(err => toast(apiError(err, "Failed to load"), "bad")), [toast]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <Shell title="System health">
      <div className="mb-4 flex items-center gap-3">
        {data && <Badge tone={data.status}>{TEXT[data.status]}</Badge>}
        <span className="text-sm text-ink-2">Checked {when(data?.checkedAt)}</span>
        <Button variant="secondary" className="ml-auto" onClick={load}>Re-check</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card title="Services">
          <table className="w-full text-sm">
            <tbody>
              {data && Object.entries(data.checks).map(([key, c]) => (
                <tr key={key} className="border-b border-line/60">
                  <td className="py-3 font-semibold">{LABEL[key] || key}</td>
                  <td><Badge tone={c.status}>{TEXT[c.status]}</Badge></td>
                  <td className="text-ink-2">{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Host">
          {data && (
            <dl className="grid gap-3 text-sm">
              <div><dt className="text-ink-3">Load (1/5/15 min)</dt><dd className="font-mono">{data.host.load.join(" / ")} on {data.host.cpus} vCPU</dd></div>
              <div><dt className="text-ink-3">Memory</dt><dd className="font-mono">{data.host.memTotalMb} MB total</dd></div>
              <div><dt className="text-ink-3">API uptime</dt><dd className="font-mono">{duration(data.host.apiUptimeSec)}</dd></div>
              <div><dt className="text-ink-3">Monitor</dt><dd className="font-mono">{data.monitor.devices} devices · {data.monitor.samples} samples · {data.monitor.events} events</dd></div>
            </dl>
          )}
        </Card>
      </div>
    </Shell>
  );
}
