import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import api from "../lib/api";
import { useUser, can } from "../lib/session";
import { ago, apiError, HEALTH_TONE, gradeTone } from "../lib/format";
import Shell from "../components/Shell";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { Table, Row, Cell } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";
import useAction from "../lib/useAction";

function PortDetail({ portId, canWrite, onChange }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const load = useCallback(() => api.get(`/topology/ports/${portId}`).then(({ data }) => setData(data)).catch(err => toast(apiError(err, "Failed to load port"), "bad")), [portId, toast]);
  useEffect(() => { load(); }, [load]);

  async function remove(s) {
    if (!window.confirm(`Delete service ${s.serviceId}? The device stays in the ACS.`)) return;
    try {
      await api.delete(`/topology/services/${s._id}`);
      load();
      onChange();
    } catch (err) {
      toast(apiError(err, "Delete failed"), "bad");
    }
  }

  if (!data) return <p className="text-sm">Loading...</p>;
  return (
    <Card title={data.port.name} action={<Link className="text-sm font-semibold text-plum underline" href={`/devices?pon=${portId}`}>Open in device list</Link>}>
      <Table head={["ONU", "Customer", "Service", "Device", "Status", "Health", "Rx", "Splitter", ...(canWrite ? [""] : [])]}>
        {data.services.map(s => (
          <Row key={s._id}>
            <Cell mono>{s.onuId}</Cell>
            <Cell>{s.customer ? `${s.customer.name} · ${s.customer.accountId}` : null}</Cell>
            <Cell mono>{s.serviceId}{s.plan && <div className="text-ink-2">{s.plan}</div>}</Cell>
            <Cell>{s.device ? <Link className="font-semibold text-plum underline" href={`/devices/${s.device._id}`}>{s.device.serialNumber}</Link> : <span className="text-ink-3">not matched</span>}</Cell>
            <Cell>{s.device ? <Badge tone={s.device.online ? "ok" : s.device.online === false ? "bad" : "muted"}>{s.device.online ? "online" : s.device.online === false ? `offline ${ago(s.device.offlineSince)}` : "unknown"}</Badge> : <Badge>{s.status}</Badge>}</Cell>
            <Cell>{s.device?.health?.status && s.device.health.status !== "offline" ? <Badge tone={HEALTH_TONE[s.device.health.status]}>{s.device.health.score}</Badge> : null}</Cell>
            <Cell>{s.device?.rxPower !== undefined && s.device?.rxPower !== null ? <Badge tone={gradeTone(s.device.rxGrade)}>{s.device.rxPower}</Badge> : null}</Cell>
            <Cell>{s.splitter}</Cell>
            {canWrite && <Cell className="text-right"><button className="text-xs font-semibold text-bad underline" onClick={() => remove(s)}>Delete</button></Cell>}
          </Row>
        ))}
      </Table>
    </Card>
  );
}

function ImportCard({ onDone }) {
  const toast = useToast();
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState(null);
  const [busy, run] = useAction();

  const send = dryRun => run(async () => {
    try {
      const { data } = await api.post(`/topology/import?dryRun=${dryRun ? 1 : 0}&skipErrors=1`, csv, { headers: { "Content-Type": "text/csv" } });
      setResult(data);
      if (!dryRun) {
        toast(`Imported ${data.stats.servicesCreated + data.stats.servicesUpdated} services.`, "ok");
        onDone();
      }
    } catch (err) {
      toast(apiError(err, "Import failed"), "bad");
    }
  });

  const s = result?.stats;
  return (
    <Card title="Import from OLT export (CSV)" action={<a className="text-sm font-semibold text-plum underline" href="#" onClick={async e => {
      e.preventDefault();
      const { data } = await api.get("/topology/template.csv", { responseType: "blob" });
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(data), download: "topology-template.csv" });
      a.click();
      URL.revokeObjectURL(a.href);
    }}>Template</a>}>
      <p className="mb-3 text-sm text-ink-2">Columns: olt, pon (or onu_id like EPON0/1:29), and one of serial / mac / pppoe. Optional: pop, account, customer_name, plan, vlan, splitter. Re-importing updates by service_id (default: pppoe).</p>
      <input type="file" accept=".csv,text/csv" className="mb-3 text-sm" onChange={e => e.target.files[0]?.text().then(t => { setCsv(t); setResult(null); })} />
      <textarea className="h-32 w-full rounded-control border border-line bg-white p-3 font-mono text-xs outline-none focus:border-plum" value={csv} onChange={e => { setCsv(e.target.value); setResult(null); }} placeholder="olt,pon,onu_id,mac,pppoe,account" />
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" disabled={!csv.trim() || busy} onClick={() => send(true)}>Dry run</Button>
        <Button disabled={!result?.dryRun || busy} onClick={() => send(false)}>Import {result?.dryRun ? `${s.rows} rows` : ""}</Button>
      </div>
      {result && (
        <div className="mt-4 grid gap-2 text-sm">
          <p>
            <Badge tone={result.dryRun ? "warn" : "ok"}>{result.dryRun ? "Dry run" : "Imported"}</Badge>{" "}
            {s.rows} rows · {s.servicesCreated} new / {s.servicesUpdated} updated services · {s.devicesLinked} devices matched, {s.unmatched} not yet seen · new: {s.olts} OLTs, {s.ponPorts} PON ports, {s.pops} POPs, {s.customersCreated} customers
          </p>
          {result.unknownColumns.length > 0 && <p className="text-warn">Ignored columns: {result.unknownColumns.join(", ")}</p>}
          {[...result.errors.map(e => ({ line: e.line, text: e.error, tone: "text-bad" })), ...result.warnings.map(w => ({ line: w.line, text: w.warning, tone: "text-warn" }))].slice(0, 50).map((m, i) => (
            <p key={i} className={`font-mono text-xs ${m.tone}`}>line {m.line}: {m.text}</p>
          ))}
          {result.errorCount > 0 && <p className="text-xs text-ink-2">{result.errorCount} row(s) with errors are skipped.</p>}
        </div>
      )}
    </Card>
  );
}

export default function Topology() {
  const toast = useToast();
  const router = useRouter();
  const user = useUser();
  const [data, setData] = useState(null);
  const port = typeof router.query.port === "string" ? router.query.port : null;
  const canWrite = can(user, "topology.write");

  const load = useCallback(() => api.get("/topology").then(({ data }) => setData(data)).catch(err => toast(apiError(err, "Failed to load topology"), "bad")), [toast]);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const pick = id => router.replace({ pathname: "/topology", query: id ? { port: id } : {} }, undefined, { shallow: true });
  const popName = id => data?.pops.find(p => String(p._id) === String(id))?.name;

  return (
    <Shell title="Topology">
      <div className="grid gap-4">
        {!data && <p className="text-sm">Loading...</p>}
        {data && data.olts.length === 0 && <Card><p className="text-sm text-ink-2">No OLTs yet. {canWrite ? "Import an OLT export below." : "Ask an admin to import the OLT export."}</p></Card>}
        {data?.olts.map(o => (
          <Card key={o._id} title={<>{o.name} <span className="ml-2 text-xs font-normal text-ink-2">{[popName(o.pop), o.vendor, o.ponType, o.mgmtIp].filter(Boolean).join(" · ")}</span></>}>
            {o.ports.length === 0 ? <p className="text-sm text-ink-2">No PON ports.</p> : (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
                {o.ports.map(p => (
                  <button
                    key={p._id}
                    onClick={() => pick(port === String(p._id) ? null : p._id)}
                    className={`rounded-control border p-3 text-left text-sm ${port === String(p._id) ? "border-plum" : "border-line"} ${p.outage ? "bg-bad-bg" : p.offline ? "bg-warn-bg/50" : "bg-white"}`}
                  >
                    <div className="font-semibold text-plum">{p.label || [p.slot, p.port].filter(Boolean).join("/")}</div>
                    <div className="text-xs text-ink-2">{p.online}/{p.total} online{p.offline ? ` · ${p.offline} off` : ""}</div>
                    {p.outage && <div className="mt-1 text-xs font-bold text-bad">Outage · {ago(p.since)}</div>}
                  </button>
                ))}
              </div>
            )}
          </Card>
        ))}
        {port && <PortDetail key={port} portId={port} canWrite={canWrite} onChange={load} />}
        {canWrite && <ImportCard onDone={load} />}
      </div>
    </Shell>
  );
}
