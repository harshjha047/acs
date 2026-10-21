import Card from "../ui/Card";
import { bitrate } from "../../lib/format";

export default function LanPorts({ ports }) {
  return (
    <Card title="LAN ports">
      {ports.length === 0 ? <p className="text-sm text-ink-2">No LAN port data.</p> : (
        <div className="flex flex-wrap gap-3">
          {ports.map(p => (
            <div key={p.id} className={`min-w-28 rounded-control border px-4 py-3 ${p.up ? "border-ok bg-ok-bg" : "border-line"}`}>
              <div className="text-sm font-bold text-plum">{p.label}</div>
              <div className={`text-xs ${p.up ? "text-ok" : "text-ink-2"}`}>{p.status || "unknown"}{p.up && p.speed ? ` · ${bitrate(p.speed)}` : ""}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
