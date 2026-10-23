import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import api from "../lib/api";
import { ago, apiError, when, EVENT_LABEL, EVENT_TONE, describeEvent, ALERT_LABEL, SEVERITY_TONE } from "../lib/format";
import Shell from "../components/Shell";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { Table, Row, Cell } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-card border border-line bg-white p-5">
      <div className="font-mono text-[11px] uppercase tracking-widest text-ink-3">{label}</div>
      <div className={`mt-1 text-3xl font-extrabold ${{ ok: "text-ok", bad: "text-bad", warn: "text-warn" }[tone] || "text-plum"}`}>{value ?? "—"}</div>
    </div>
  );
}

const customerOf = d => (d?.customer ? `${d.customer.name} · ${d.customer.accountId}` : d?.pppoeUsername || d?.serialNumber);

export default function Outage() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [role, setRole] = useState(null);

  useEffect(() => { setRole(JSON.parse(localStorage.getItem("user") || "null")?.role || null); }, []);

  const load = useCallback(() => Promise.all([api.get("/outage"), api.get("/alerts")])
    .then(([o, a]) => { setData(o.data); setAlerts(a.data); })
    .catch(err => toast(apiError(err, "Failed to load"), "bad")), [toast]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  async function ack(a) {
    try {
      await api.post(`/alerts/${a._id}/ack`);
      toast("Acknowledged.", "ok", { duration: 2000 });
      load();
    } catch (err) {
      toast(apiError(err, "Could not acknowledge"), "bad");
    }
  }

  const t = data?.totals;
  const m = data?.monitor;
  return (
    <Shell title="Outage & alerts">
      {!data && <p className="text-sm">Loading...</p>}
      {data && (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <Stat label="Devices" value={t.devices} />
            <Stat label="Online" value={t.online} tone="ok" />
            <Stat label="Offline" value={t.offline} tone={t.offline ? "bad" : undefined} />
            <Stat label="Rx out of range" value={t.lowRx} tone={t.lowRx ? "warn" : undefined} />
            <Stat label="Critical alerts" value={t.alerts.critical || 0} tone={t.alerts.critical ? "bad" : undefined} />
          </div>
          <p className="font-mono text-[11px] text-ink-3">
            Monitor {m.error ? <span className="text-bad">error: {m.error}</span> : "ok"} · last run {ago(m.lastRunAt)} · {m.devices} devices in {m.durationMs ?? "—"} ms · auto-refresh 30 s
          </p>

          {data.clusters.length > 0 && (
            <Card title="Possible area outages" className="border-bad">
              {data.clusters.map((c, i) => (
                <p key={i} className="text-sm"><Badge tone="bad">{c.count} devices</Badge> <span className="ml-2">went offline between {when(c.from)} and {when(c.to)}. Check OLT / PON / power in that area.</span></p>
              ))}
            </Card>
          )}

          <Card title={`Open alerts (${alerts.length})`}>
            {alerts.length === 0 ? <p className="text-sm text-ink-2">All clear.</p> : (
              <Table head={["Severity", "Alert", "Customer / device", "Detail", "Since", ""]}>
                {alerts.map(a => (
                  <Row key={a._id}>
                    <Cell><Badge tone={SEVERITY_TONE[a.severity]}>{a.severity}</Badge></Cell>
                    <Cell>{ALERT_LABEL[a.type] || a.type}</Cell>
                    <Cell>{a.device ? <Link className="font-semibold text-plum underline" href={`/devices/${a.device._id}`}>{customerOf(a.device)}</Link> : "—"}</Cell>
                    <Cell>{a.message}{a.ackBy && <div className="text-xs text-ink-2">ack by {a.ackBy.name} {ago(a.ackAt)}</div>}</Cell>
                    <Cell>{ago(a.openedAt)}</Cell>
                    <Cell className="text-right">{!a.ackAt && (role === "noc" || role === "admin") && <Button variant="secondary" onClick={() => ack(a)}>Ack</Button>}</Cell>
                  </Row>
                ))}
              </Table>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={`Offline devices (${data.offline.length})`}>
              {data.offline.length === 0 ? <p className="text-sm text-ink-2">None.</p> : (
                <Table head={["Customer / device", "Model", "Last seen", "Last Rx"]}>
                  {data.offline.map(d => (
                    <Row key={d._id}>
                      <Cell><Link className="font-semibold text-plum underline" href={`/devices/${d._id}`}>{customerOf(d)}</Link></Cell>
                      <Cell>{d.productClass}</Cell>
                      <Cell>{ago(d.offlineSince || d.lastInformAt)}</Cell>
                      <Cell>{d.rxPower ?? "—"}</Cell>
                    </Row>
                  ))}
                </Table>
              )}
            </Card>
            <Card title="Recent fleet events">
              <ol className="flex flex-col">
                {data.events.map(e => (
                  <li key={e._id} className="flex flex-wrap items-center gap-3 border-b border-line/60 py-2 text-sm last:border-0">
                    <span className="w-36 font-mono text-xs text-ink-3">{when(e.at)}</span>
                    <Badge tone={EVENT_TONE[e.type] || "muted"}>{EVENT_LABEL[e.type] || e.type}</Badge>
                    {e.device && <Link className="font-semibold text-plum underline" href={`/devices/${e.device._id}`}>{e.device.pppoeUsername || e.device.serialNumber}</Link>}
                    <span className="text-ink-2">{describeEvent(e)}</span>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </div>
      )}
    </Shell>
  );
}
