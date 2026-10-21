import { useEffect, useState } from "react";
import api from "../lib/api";
import Shell from "../components/Shell";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";

const resultTone = { success: "ok", failed: "bad", pending: "warn" };

export default function Audit() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/audit")
      .then(({ data }) => setLogs(data))
      .catch(() => setError("Failed to load audit log"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Shell title="Audit log">
      <Card>
        {loading && <p className="text-sm">Loading...</p>}
        {error && <p className="text-sm font-semibold text-bad">{error}</p>}
        {!loading && !error && logs.length === 0 && <p className="text-sm text-ink-2">No activity yet.</p>}
        {logs.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-widest text-ink-3">
                <th className="py-2">Time</th><th>User</th><th>Device</th><th>Action</th><th>Result</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l._id} className="border-b border-line/60">
                  <td className="py-3">{new Date(l.timestamp).toLocaleString()}</td>
                  <td>{l.user?.name || "—"}</td>
                  <td className="font-mono">{l.device?.serialNumber || "—"}</td>
                  <td>{l.action}</td>
                  <td><Badge tone={resultTone[l.result]}>{l.result}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </Shell>
  );
}
