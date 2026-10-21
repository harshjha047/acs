import { useEffect, useMemo, useState } from "react";
import api from "../../lib/api";
import { apiError } from "../../lib/format";
import Card from "../ui/Card";
import { Table, Row, Cell } from "../ui/Table";

export default function ParamsTable({ deviceId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);

  useEffect(() => {
    api.get(`/devices/${deviceId}/parameters`).then(({ data }) => setData(data)).catch(err => setError(apiError(err, "Failed to load parameters")));
  }, [deviceId]);

  const params = data?.parameters || [];
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return params.filter(p => (showEmpty || (p.value !== null && p.value !== "")) &&
      (!q || p.path.toLowerCase().includes(q) || String(p.value ?? "").toLowerCase().includes(q)));
  }, [params, query, showEmpty]);

  return (
    <Card>
      {error && <p className="text-sm font-semibold text-bad">{error}</p>}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter by path or value"
          className="h-11 w-80 rounded-control border border-line px-4 text-sm outline-none focus:border-plum" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showEmpty} onChange={e => setShowEmpty(e.target.checked)} /> Show parameters without a value
        </label>
        <span className="font-mono text-xs text-ink-3">{rows.length} / {params.length}</span>
      </div>
      <Table head={["Path", "Value", "Type", "Writable"]}>
        {rows.slice(0, 1500).map(p => (
          <Row key={p.path}>
            <Cell mono>{p.path}</Cell>
            <Cell className="break-all font-semibold text-plum">{p.value === null ? "—" : String(p.value)}</Cell>
            <Cell className="text-ink-2">{p.type?.replace("xsd:", "")}</Cell>
            <Cell>{p.writable ? "yes" : "no"}</Cell>
          </Row>
        ))}
      </Table>
    </Card>
  );
}
