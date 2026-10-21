import Card from "../ui/Card";
import Badge from "../ui/Badge";
import { gradeTone } from "../../lib/format";

const HINT = {
  ok: "Signal within range.",
  warn: "Marginal. Check patch cord and connectors; monitor.",
  bad: "Out of range. Likely fiber cut, bend or dirty connector. Dispatch a technician.",
  unknown: "Not reported by this device."
};

function Reading({ label, r, range }) {
  return (
    <div className="rounded-control border border-line p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-widest text-ink-3">{label}</span>
        <Badge tone={gradeTone(r.grade)}>{r.grade}</Badge>
      </div>
      <div className="mt-2 text-3xl font-extrabold text-plum">{r.dbm === null ? "—" : `${r.dbm} dBm`}</div>
      <p className="mt-1 text-xs text-ink-2">Normal {range}</p>
      {r.dbm !== null && r.assumed && <p className="mt-1 text-xs text-warn">Unit assumed ({r.unit}, raw {String(r.raw)}). Verify against the ONT web page.</p>}
    </div>
  );
}

export default function OpticalCard({ optical }) {
  if (!optical.rxPower.path && !optical.txPower.path) {
    return <Card title="Optical signal"><p className="text-sm text-ink-2">No optical readings. Not a fiber ONT, or the vendor path is not mapped yet (see Readiness).</p></Card>;
  }
  return (
    <Card title="Optical signal">
      <div className="grid gap-3 sm:grid-cols-2">
        <Reading label="Rx power" r={optical.rxPower} range="-8 to -25 dBm" />
        <Reading label="Tx power" r={optical.txPower} range="0.5 to 5 dBm" />
      </div>
      <p className="mt-3 text-sm text-ink">{HINT[optical.rxPower.grade]}</p>
    </Card>
  );
}
