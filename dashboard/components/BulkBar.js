import { useEffect, useState } from "react";
import api from "../lib/api";
import { apiError, input } from "../lib/format";
import Button from "./ui/Button";
import Modal from "./ui/Modal";
import { useToast } from "./ui/Toast";
import useAction from "../lib/useAction";

const ACTIONS = {
  tag: { label: "Add tag", roles: ["noc", "admin"] },
  untag: { label: "Remove tag", roles: ["noc", "admin"] },
  provision: { label: "Apply template", roles: ["admin"], reason: true, danger: true },
  reboot: { label: "Reboot", roles: ["admin"], reason: true, danger: true, max: 50 }
};

export default function BulkBar({ ids, role, onDone, onClear }) {
  const toast = useToast();
  const [action, setAction] = useState(null);
  const [form, setForm] = useState({ tag: "", templateId: "", reason: "" });
  const [templates, setTemplates] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, run] = useAction();
  const spec = ACTIONS[action];

  useEffect(() => {
    if (action === "provision") api.get("/templates").then(({ data }) => setTemplates(data.filter(t => t.isActive))).catch(() => {});
  }, [action]);

  const close = () => { setAction(null); setResult(null); setForm({ tag: "", templateId: "", reason: "" }); };

  const submit = () => run(async () => {
    try {
      const { data } = await api.post("/devices/bulk", { action, ids, ...form });
      const { done, skipped, failed } = data.summary;
      toast(`${spec.label}: ${done} done, ${skipped} skipped, ${failed} failed`, failed ? "bad" : skipped ? "warn" : "ok");
      if (skipped || failed) setResult(data.results.filter(r => r.outcome !== "done" && r.outcome !== "queued"));
      else close();
      onDone();
    } catch (err) {
      toast(apiError(err, "Bulk action failed"), "bad");
    }
  });

  const allowed = Object.entries(ACTIONS).filter(([, a]) => a.roles.includes(role));
  if (!ids.length || !allowed.length) return null;
  const tooMany = spec?.max && ids.length > spec.max;
  const ready = spec && !tooMany && (!spec.reason || form.reason.trim()) && (action !== "provision" || form.templateId) && (!action.includes("tag") || form.tag.trim());

  return (
    <div className="sticky top-2 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-card border border-plum/30 bg-white px-4 py-3 shadow-lg">
      <span className="mr-2 text-sm font-semibold">{ids.length} selected</span>
      {allowed.map(([k, a]) => <Button key={k} variant={a.danger ? "danger" : "secondary"} className="min-h-9 px-3" onClick={() => setAction(k)}>{a.label}</Button>)}
      <button className="ml-auto text-sm underline" onClick={onClear}>Clear</button>

      <Modal open={!!action} onClose={close} title={`${spec?.label || ""} · ${ids.length} devices`} footer={!result && <>
        <Button variant="secondary" onClick={close}>Cancel</Button>
        <Button variant={spec?.danger ? "danger" : "primary"} disabled={!ready} loading={busy} onClick={submit}>{spec?.label}</Button>
      </>}>
        {result ? (
          <div className="grid gap-2">
            <ul className="max-h-60 overflow-y-auto text-xs">{result.map(r => <li key={r.id}><span className="font-mono">{r.serialNumber || r.id}</span>: {r.outcome}{r.error ? ` (${r.error})` : ""}</li>)}</ul>
            <div className="flex justify-end"><Button onClick={close}>Close</Button></div>
          </div>
        ) : (
          <div className="grid gap-3">
            {tooMany && <p className="font-semibold text-bad">At most {spec.max} devices per {action}.</p>}
            {action?.includes("tag") && <input className={input} placeholder="Tag, e.g. pilot" value={form.tag} onChange={e => setForm({ ...form, tag: e.target.value })} />}
            {action === "provision" && (
              <>
                <select className={input} value={form.templateId} onChange={e => setForm({ ...form, templateId: e.target.value })}>
                  <option value="">Pick a template</option>
                  {templates.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                </select>
                <p className="text-xs text-ink-2">Each device gets its own SSID from the template pattern and, if the template generates one, its own password. Applies at each device&apos;s next check-in.</p>
              </>
            )}
            {action === "reboot" && <p className="text-xs text-ink-2">Customers lose service for about 90 seconds. Runs at each device&apos;s next check-in.</p>}
            {spec?.reason && <input className={input} placeholder="Reason (required)" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />}
          </div>
        )}
      </Modal>
    </div>
  );
}
