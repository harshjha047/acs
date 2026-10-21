import { useEffect, useState } from "react";
import Link from "next/link";
import api from "../../lib/api";
import { ago, gradeTone, onlineState } from "../../lib/format";
import Shell from "../../components/Shell";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import { Table, Row, Cell } from "../../components/ui/Table";

const tone = { online: "ok", offline: "bad", unknown: "muted" };

export default function DeviceList() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api.get("/devices", { params: q.trim() ? { q: q.trim() } : {} })
        .then(({ data }) => { setDevices(data); setError(""); })
        .catch(() => setError("Failed to load devices"))
        .finally(() => setLoading(false));
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q]);

  const offline = devices.filter(d => onlineState(d) === "offline").length;

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
        {!loading && <span className="text-sm text-ink-2">{devices.length} devices{offline ? ` · ${offline} offline` : ""}</span>}
      </div>
      <Card>
        {loading && devices.length === 0 && <p className="text-sm">Loading...</p>}
        {error && <p className="text-sm font-semibold text-bad">{error}</p>}
        {!loading && !error && devices.length === 0 && <p className="text-sm text-ink-2">{q ? "No matches." : "No devices have connected yet."}</p>}
        {devices.length > 0 && (
          <Table head={["Status", "Customer", "PPPoE / IP", "Serial", "Model", "Rx", "Last seen", ""]}>
            {devices.map(d => {
              const state = onlineState(d);
              return (
                <Row key={d._id}>
                  <Cell><Badge tone={tone[state]}>{state}</Badge></Cell>
                  <Cell>{d.customer ? <><div className="font-semibold text-plum">{d.customer.name}</div><div className="font-mono text-xs text-ink-2">{d.customer.accountId}</div></> : <span className="text-ink-3">unlinked</span>}</Cell>
                  <Cell mono>{d.pppoeUsername || d.wanIp}</Cell>
                  <Cell mono>{d.serialNumber}</Cell>
                  <Cell>{d.manufacturer?.split(" ")[0]} {d.productClass}</Cell>
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
