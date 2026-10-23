import { useEffect, useState } from "react";
import Link from "next/link";
import api from "../../lib/api";
import { HEALTH_TONE, portName } from "../../lib/format";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Field from "../ui/Field";

const LABEL = { optical: "Optical", internet: "Internet", stability: "Stability", ethernet: "Ethernet" };
const barTone = s => (s >= 80 ? "bg-ok" : s >= 50 ? "bg-warn" : "bg-bad");

export default function DiagnosisCard({ device }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const id = device._id;

  useEffect(() => {
    let live = true;
    const load = () => api.get(`/devices/${id}/health`).then(({ data }) => live && (setData(data), setError(""))).catch(() => live && setError("Could not load diagnosis"));
    load();
    const t = setInterval(load, 60000);
    return () => { live = false; clearInterval(t); };
  }, [id]);

  const h = data?.health;
  const svc = device.service;
  return (
    <Card title="Health & likely cause" action={h && <Badge tone={HEALTH_TONE[h.status]}>{h.status === "offline" ? "offline" : `${h.score} / 100 · ${h.status}`}</Badge>}>
      {error && <p className="text-sm text-bad">{error}</p>}
      {!data && !error && <p className="text-sm">Loading...</p>}
      {data && (
        <div className="grid gap-5">
          {h && h.status !== "offline" && (
            <div className="grid gap-2">
              {Object.entries(h.components).filter(([, c]) => c).map(([k, c]) => (
                <div key={k} className="grid grid-cols-[90px_1fr_auto] items-center gap-3 text-sm">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-ink-3">{LABEL[k]}</span>
                  <div className="h-2 rounded-full bg-canvas"><div className={`h-2 rounded-full ${barTone(c.score)}`} style={{ width: `${c.score}%` }} /></div>
                  <span className="text-xs text-ink-2">{c.note}</span>
                </div>
              ))}
            </div>
          )}
          <ol className="grid gap-3">
            {data.causes.map(c => (
              <li key={c.code} className={`rounded-control border px-4 py-3 ${c.code === "ok" ? "border-line" : c.confidence >= 0.75 ? "border-bad/40 bg-bad-bg/40" : "border-warn/40 bg-warn-bg/40"}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-plum">{c.title}</span>
                  {c.code !== "ok" && <span className="font-mono text-[11px] text-ink-3">{Math.round(c.confidence * 100)}% likely</span>}
                </div>
                {c.evidence.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-ink-2">{c.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>}
                {c.action && <p className="mt-2 text-sm">{c.action}</p>}
              </li>
            ))}
          </ol>
          <dl className="grid grid-cols-2 gap-5 border-t border-line pt-4 md:grid-cols-4">
            <Field label="PON port">
              {svc?.ponPort ? <Link className="underline" href={`/topology?port=${svc.ponPort._id}`}>{portName(svc.ponPort)}</Link> : "Not mapped"}
            </Field>
            <Field label="ONU id" value={svc?.onuId} mono />
            <Field label="Splitter" value={svc?.splitter} />
            <Field label="PON neighbours" value={data.pon ? `${data.pon.online}/${data.pon.total} online` : null} />
          </dl>
        </div>
      )}
    </Card>
  );
}
