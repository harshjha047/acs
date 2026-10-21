import { useEffect, useState } from "react";
import Link from "next/link";
import api from "../../lib/api";
import Shell from "../../components/Shell";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";

const statusTone = { provisioned: "ok", unprovisioned: "muted", flagged: "warn", decommissioned: "bad" };

export default function DeviceList() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/devices")
      .then(({ data }) => setDevices(data))
      .catch(() => setError("Failed to load devices"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Shell title="Devices">
      <Card>
        {loading && <p className="text-sm">Loading...</p>}
        {error && <p className="text-sm font-semibold text-bad">{error}</p>}
        {!loading && !error && devices.length === 0 && <p className="text-sm text-ink-2">No devices have connected yet.</p>}
        {!loading && devices.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-widest text-ink-3">
                <th className="py-2">Serial</th>
                <th>Manufacturer</th>
                <th>Model</th>
                <th>Status</th>
                <th>Last inform</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {devices.map(d => (
                <tr key={d._id} className="border-b border-line/60">
                  <td className="py-3 font-mono">{d.serialNumber}</td>
                  <td>{d.manufacturer}</td>
                  <td>{d.productClass}</td>
                  <td><Badge tone={statusTone[d.status]}>{d.status}</Badge></td>
                  <td>{d.lastInformAt ? new Date(d.lastInformAt).toLocaleString() : "—"}</td>
                  <td className="text-right">
                    <Link href={`/devices/${d._id}`} className="font-semibold text-plum underline">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </Shell>
  );
}
