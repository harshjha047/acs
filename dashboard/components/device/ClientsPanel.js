import { useCallback, useEffect, useState } from "react";
import api from "../../lib/api";
import { apiError, gradeTone } from "../../lib/format";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { Table, Row, Cell } from "../ui/Table";
import { useToast } from "../ui/Toast";
import LanPorts from "./LanPorts";

export default function ClientsPanel({ deviceId }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get(`/devices/${deviceId}/clients`).then(({ data }) => setData(data)).catch(err => setError(apiError(err, "Failed to load clients")));
  }, [deviceId]);
  useEffect(load, [load]);

  async function refresh() {
    setBusy(true);
    try {
      const { status } = await api.post(`/devices/${deviceId}/refresh?scope=clients`);
      toast(status === 202 ? "Queued. Device not reachable now; list updates after its next check-in." : "Client list updated.", status === 202 ? "warn" : "ok");
      load();
    } catch (err) {
      toast(apiError(err, "Refresh failed"), "bad");
    } finally {
      setBusy(false);
    }
  }

  const rows = data?.clients || [];
  return (
    <div className="grid gap-4">
      <Card
        title={`Connected devices (${rows.filter(c => c.active !== false).length} active / ${rows.length})`}
        action={<Button variant="secondary" loading={busy} onClick={refresh}>{busy ? "Fetching…" : "Fetch live list"}</Button>}
      >
        {error && <p className="text-sm font-semibold text-bad">{error}</p>}
        {!data && !error && <p className="text-sm">Loading...</p>}
        {data && rows.length === 0 && <p className="text-sm text-ink-2">No devices reported. Click “Fetch live list”.</p>}
        {rows.length > 0 && (
          <Table head={["Name", "IP", "MAC", "Connected via", "Signal", "Status"]}>
            {rows.map((c, i) => (
              <Row key={c.mac || i} className={c.active === false ? "opacity-60" : ""}>
                <Cell>{c.name || <span className="text-ink-3">unknown</span>}</Cell>
                <Cell mono>{c.ip}</Cell>
                <Cell mono>{c.mac}</Cell>
                <Cell>{c.via === "wifi" ? `Wi-Fi${c.ssid ? ` · ${c.ssid}` : ""}${c.band ? ` (${c.band})` : ""}` : c.via === "ethernet" ? `Cable${c.port ? ` · LAN ${c.port}` : ""}` : "—"}</Cell>
                <Cell>{c.signal !== null ? <Badge tone={gradeTone(c.signalGrade)}>{c.signal} dBm</Badge> : "—"}</Cell>
                <Cell>{c.active === false ? "inactive" : "active"}</Cell>
              </Row>
            ))}
          </Table>
        )}
        {rows.some(c => c.signalGrade === "bad") && <p className="mt-3 text-sm text-warn">Weak signal (below -75 dBm) on some devices: move closer, use 5 GHz nearby, or add a mesh/extender.</p>}
      </Card>
      {data && <LanPorts ports={data.lanPorts} />}
    </div>
  );
}
