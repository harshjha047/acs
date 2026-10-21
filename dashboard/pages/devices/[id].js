import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import api from "../../lib/api";
import Shell from "../../components/Shell";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import { useToast } from "../../components/ui/Toast";

const SECTIONS = [
  { title: "Device info", marker: ".DeviceInfo." },
  { title: "WAN", marker: ".WANDevice." },
  { title: "Wi-Fi", marker: ".WLANConfiguration." },
  { title: "Management", marker: ".ManagementServer." }
];

const HOST_RE = /\.Hosts\.Host\.(\d+)\.(\w+)$/;
const statusTone = { provisioned: "ok", unprovisioned: "muted", flagged: "warn", decommissioned: "bad" };

function Field({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="truncate font-mono text-[11px] uppercase tracking-widest text-ink-3" title={label}>{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-plum">{String(value)}</dd>
    </div>
  );
}

export default function DeviceDetail() {
  const router = useRouter();
  const { id } = router.query;
  const toast = useToast();

  const [device, setDevice] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [query, setQuery] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [d, p] = await Promise.all([api.get(`/devices/${id}`), api.get(`/devices/${id}/parameters`)]);
      setDevice(d.data);
      setData(p.data);
    } catch {
      setError("Failed to load device");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const params = data?.parameters || [];
  const populated = useMemo(() => params.filter(p => p.value !== null && p.value !== ""), [params]);

  const sections = useMemo(() => SECTIONS.map(s => ({
    title: s.title,
    items: populated.filter(p => p.path.includes(s.marker)).map(p => ({
      label: p.path.slice(p.path.indexOf(s.marker) + s.marker.length),
      value: p.value
    }))
  })).filter(s => s.items.length), [populated]);

  const hosts = useMemo(() => {
    const rows = {};
    for (const p of populated) {
      const m = p.path.match(HOST_RE);
      if (m) (rows[m[1]] ||= {})[m[2]] = p.value;
    }
    return Object.entries(rows).sort((a, b) => a[0] - b[0]).map(([n, r]) => ({ n, ...r }));
  }, [populated]);

  const table = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (showEmpty ? params : populated).filter(p =>
      !q || p.path.toLowerCase().includes(q) || String(p.value ?? "").toLowerCase().includes(q)
    );
  }, [params, populated, query, showEmpty]);

  async function act(kind, url, okMsg) {
    setBusy(kind);
    try {
      await api.post(url);
      toast(okMsg, "ok");
    } catch {
      toast(`${kind} failed`, "bad");
    } finally {
      setBusy("");
      setConfirmOpen(false);
    }
  }

  const tabBtn = name => `rounded-control px-4 py-2 text-sm font-semibold ${tab === name ? "bg-plum text-white" : "text-ink-2 hover:bg-white"}`;

  return (
    <Shell title={device ? `Device ${device.serialNumber}` : "Device"}>
      {loading && <p className="text-sm">Loading...</p>}
      {error && <p className="text-sm font-semibold text-bad">{error}</p>}

      {device && (
        <>
          <Card className="mb-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <dl className="grid grid-cols-2 gap-6 md:grid-cols-5">
                <Field label="Manufacturer" value={device.manufacturer} />
                <Field label="Model" value={device.productClass} />
                <Field label="OUI" value={device.oui} />
                <Field label="Last inform" value={data?.lastInform ? new Date(data.lastInform).toLocaleString() : "—"} />
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-widest text-ink-3">Status</dt>
                  <dd className="mt-1"><Badge tone={statusTone[device.status]}>{device.status}</Badge></dd>
                </div>
              </dl>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={load}>Reload</Button>
                <Button variant="secondary" disabled={!!busy} onClick={() => act("Refresh", `/devices/${id}/refresh`, "Refresh queued. Values update after the next device inform.")}>
                  {busy === "Refresh" ? "Queuing..." : "Refresh from device"}
                </Button>
                <Button variant="danger" onClick={() => setConfirmOpen(true)}>Reboot</Button>
              </div>
            </div>
          </Card>

          <div className="mb-4 flex gap-2">
            <button className={tabBtn("overview")} onClick={() => setTab("overview")}>Overview</button>
            <button className={tabBtn("params")} onClick={() => setTab("params")}>All parameters ({populated.length}/{params.length})</button>
          </div>

          {tab === "overview" && (
            <div className="grid gap-4 lg:grid-cols-2">
              {sections.map(s => (
                <Card key={s.title} title={s.title}>
                  <dl className="grid grid-cols-2 gap-4">
                    {s.items.map(i => <Field key={i.label} label={i.label} value={i.value} />)}
                  </dl>
                </Card>
              ))}
              <Card title={`LAN hosts (${hosts.length})`} className="lg:col-span-2">
                {hosts.length === 0 ? <p className="text-sm text-ink-2">No hosts reported.</p> : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-widest text-ink-3">
                        <th className="py-2">#</th><th>Host name</th><th>IP</th><th>MAC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hosts.map(h => (
                        <tr key={h.n} className="border-b border-line/60">
                          <td className="py-2">{h.n}</td>
                          <td>{h.HostName || "—"}</td>
                          <td className="font-mono">{h.IPAddress || "—"}</td>
                          <td className="font-mono">{h.MACAddress || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </div>
          )}

          {tab === "params" && (
            <Card>
              <div className="mb-4 flex flex-wrap items-center gap-4">
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Filter by path or value"
                  className="h-11 w-80 rounded-control border border-line px-4 text-sm outline-none focus:border-plum"
                />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={showEmpty} onChange={e => setShowEmpty(e.target.checked)} />
                  Show parameters without a value
                </label>
                <span className="font-mono text-xs text-ink-3">{table.length} shown</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-widest text-ink-3">
                      <th className="py-2">Path</th><th>Value</th><th>Type</th><th>Writable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.map(p => (
                      <tr key={p.path} className="border-b border-line/60 align-top">
                        <td className="py-2 pr-4 font-mono text-xs">{p.path}</td>
                        <td className="break-all pr-4 font-semibold text-plum">{p.value === null ? "—" : String(p.value)}</td>
                        <td className="pr-4 text-ink-2">{p.type?.replace("xsd:", "") || "—"}</td>
                        <td>{p.writable ? "yes" : "no"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Reboot this device?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="danger" disabled={!!busy} onClick={() => act("Reboot", `/devices/${id}/reboot`, "Reboot queued")}>
              {busy === "Reboot" ? "Rebooting..." : "Reboot"}
            </Button>
          </>
        }
      >
        The customer's connection will drop for a few minutes.
      </Modal>
    </Shell>
  );
}
