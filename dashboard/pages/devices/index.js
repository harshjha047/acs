import { useEffect, useState } from "react";
import Link from "next/link";
import api from "../../lib/api";
import { ago, gradeTone, onlineState, ALERT_LABEL, SEVERITY_TONE } from "../../lib/format";
import Shell from "../../components/Shell";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import { Table, Row, Cell } from "../../components/ui/Table";
import BulkBar from "../../components/BulkBar";
import { PROV_TONE, PROV_LABEL } from "../../lib/format";

const tone = { online: "ok", offline: "bad", unknown: "muted" };

export default function DeviceList() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [tag, setTag] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [role, setRole] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => { setRole(JSON.parse(localStorage.getItem("user") || "null")?.role || null); }, []);

  useEffect(() => {
    setLoading(true);
    const [kind, value] = filter.split(":");
    const params = { ...(q.trim() && { q: q.trim() }), ...(tag.trim() && { tag: tag.trim() }), ...(kind === "prov" ? { prov: value } : filter && { state: filter }) };
    const fetchList = () => api.get("/devices", { params })
      .then(({ data }) => { setDevices(data); setError(""); })
      .catch(() => setError("Failed to load devices"))
      .finally(() => setLoading(false));
    const t = setTimeout(fetchList, q ? 300 : 0);
    const poll = setInterval(fetchList, 30000);
    return () => { clearTimeout(t); clearInterval(poll); };
  }, [q, filter, tag, tick]);

  const offline = devices.filter(d => onlineState(d) === "offline").length;
  const bulkRole = role === "noc" || role === "admin";
  const toggle = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = devices.length > 0 && devices.every(d => selected.has(d._id));
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(devices.map(d => d._id)));

  return (
    <Shell title="Devices">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <input
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search customer name, phone, account ID, PPPoE user, serial, MAC or IP"
          className="h-12 w-full max-w-xl rounded-control border border-line bg-white px-4 text-sm outline-none focus:border-plum"
        />
        <select value={filter} onChange={e => setFilter(e.target.value)} className="h-12 rounded-control border border-line bg-white px-3 text-sm">
          <option value="">All</option><option value="online">Online</option><option value="offline">Offline</option><option value="alerts">With alerts</option><option value="lowrx">Rx warn/bad</option>
          <option value="prov:pending">Provisioning waiting</option><option value="prov:queued">Provisioning queued</option><option value="prov:failed">Provisioning failed</option><option value="prov:applied">Provisioned</option>
        </select>
        <input value={tag} onChange={e => setTag(e.target.value)} placeholder="Tag" className="h-12 w-32 rounded-control border border-line bg-white px-3 text-sm outline-none focus:border-plum" />
        {!loading && <span className="text-sm text-ink-2">{devices.length} devices{offline ? ` · ${offline} offline` : ""}</span>}
      </div>
      {bulkRole && <BulkBar ids={[...selected]} role={role} onDone={() => setTick(t => t + 1)} onClear={() => setSelected(new Set())} />}
      <Card>
        {loading && devices.length === 0 && <p className="text-sm">Loading...</p>}
        {error && <p className="text-sm font-semibold text-bad">{error}</p>}
        {!loading && !error && devices.length === 0 && <p className="text-sm text-ink-2">{q ? "No matches." : "No devices have connected yet."}</p>}
        {devices.length > 0 && (
          <Table head={[...(bulkRole ? [<input key="all" type="checkbox" aria-label="Select all" checked={allOn} onChange={toggleAll} />] : []), "Status", "Alerts", "Customer", "PPPoE / IP", "Serial", "Model", "Rx", "Last seen", ""]}>
            {devices.map(d => {
              const state = onlineState(d);
              return (
                <Row key={d._id} className={selected.has(d._id) ? "bg-canvas" : ""}>
                  {bulkRole && <Cell><input type="checkbox" aria-label={`Select ${d.serialNumber}`} checked={selected.has(d._id)} onChange={() => toggle(d._id)} /></Cell>}
                  <Cell><Badge tone={tone[state]}>{state}</Badge></Cell>
                  <Cell>{d.alerts?.length ? <div className="flex flex-wrap gap-1">{d.alerts.map(a => <Badge key={a.type} tone={SEVERITY_TONE[a.severity]}>{ALERT_LABEL[a.type] || a.type}</Badge>)}</div> : null}</Cell>
                  <Cell>{d.customer ? <><div className="font-semibold text-plum">{d.customer.name}</div><div className="font-mono text-xs text-ink-2">{d.customer.accountId}</div></> : <span className="text-ink-3">unlinked</span>}</Cell>
                  <Cell mono>{d.pppoeUsername || d.wanIp}</Cell>
                  <Cell mono>{d.serialNumber}</Cell>
                  <Cell>
                    {d.manufacturer?.split(" ")[0]} {d.productClass}
                    {(d.tags?.length > 0 || d.provisioning?.state) && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {d.provisioning?.state && d.provisioning.state !== "applied" && <Badge tone={PROV_TONE[d.provisioning.state]}>{PROV_LABEL[d.provisioning.state]}</Badge>}
                        {d.tags?.map(t => <button key={t} onClick={() => setTag(t)} className="rounded-chip bg-muted-bg px-2 py-0.5 font-mono text-[11px] text-muted">{t}</button>)}
                      </div>
                    )}
                  </Cell>
                  <Cell>{d.rxPower !== undefined && d.rxPower !== null ? <Badge tone={gradeTone(d.rxGrade)}>{d.rxPower} dBm</Badge> : "—"}</Cell>
                  <Cell>{ago(d.lastInformAt)}</Cell>
                  <Cell className="text-right"><Link href={`/devices/${d._id}`} className="font-semibold text-plum underline">Open</Link></Cell>
                </Row>
              );
            })}
          </Table>
        )}
      </Card>
    </Shell>
  );
}
