import { useCallback, useEffect, useState } from "react";
import api from "../../lib/api";
import { apiError, errTone, input, when, PROV_TONE, PROV_LABEL } from "../../lib/format";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import { useToast } from "../ui/Toast";
import useAction from "../../lib/useAction";

export default function ProvisionCard({ deviceId, role }) {
  const toast = useToast();
  const [p, setP] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ templateId: "", ssid: "", ssid5: "", password: "", reason: "" });
  const [preview, setPreview] = useState(null);
  const [tags, setTags] = useState(null);
  const [busy, run] = useAction();
  const canWrite = role === "noc" || role === "admin";

  const load = useCallback(() => api.get(`/devices/${deviceId}/provisioning`).then(({ data }) => setP(data)).catch(() => {}), [deviceId]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (open) api.get("/templates").then(({ data }) => setTemplates(data.filter(t => t.isActive))).catch(() => {});
  }, [open]);

  useEffect(() => {
    setPreview(null);
    if (!open || !form.templateId) return;
    const t = setTimeout(() => api.post(`/templates/${form.templateId}/preview`, { deviceId, ssid: form.ssid, ssid5: form.ssid5, password: form.password })
      .then(({ data }) => setPreview(data)).catch(err => setPreview({ error: apiError(err, "Preview failed") })), 300);
    return () => clearTimeout(t);
  }, [open, form.templateId, form.ssid, form.ssid5, form.password, deviceId]);

  const apply = () => run(async () => {
    try {
      const { data } = await api.post(`/devices/${deviceId}/provision`, form);
      toast(data.state === "applied" ? "Template applied" : data.state === "failed" ? `Failed: ${data.error}` : "Queued. It applies at the next check-in.", data.state === "failed" ? "bad" : data.state === "applied" ? "ok" : "warn");
      setOpen(false);
      setForm({ templateId: "", ssid: "", ssid5: "", password: "", reason: "" });
      load();
    } catch (err) {
      toast(apiError(err, "Apply failed"), errTone(err));
    }
  });

  const reveal = () => run(async () => {
    try {
      const { data } = await api.get(`/devices/${deviceId}/provisioning/secret`);
      toast(data.password ? `Wi-Fi password: ${data.password}` : "No password stored", "muted", { duration: 15000 });
    } catch (err) {
      toast(apiError(err, "Failed"), "bad");
    }
  });

  const saveTags = () => run(async () => {
    try {
      const { data } = await api.put(`/devices/${deviceId}/tags`, { tags });
      setP({ ...p, tags: data.tags });
      setTags(null);
      toast("Tags saved", "ok");
    } catch (err) {
      toast(apiError(err, "Save failed"), "bad");
    }
  });

  if (!p) return null;
  const set = k => e => setForm({ ...form, [k]: e.target.value });

  return (
    <Card title="Provisioning & tags" action={role === "admin" && <Button variant="secondary" disabled={["pending", "queued"].includes(p.state)} onClick={() => setOpen(true)}>Apply template</Button>}>
      <div className="grid gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {p.state ? <Badge tone={PROV_TONE[p.state]}>{PROV_LABEL[p.state]}</Badge> : <Badge>Not provisioned</Badge>}
          {p.template && <span>{p.template.name}</span>}
          {p.requestedAt && <span className="text-xs text-ink-2">requested {when(p.requestedAt)}{p.requestedBy ? ` by ${p.requestedBy.name}` : ""}</span>}
          {p.hasPassword && canWrite && <Button variant="secondary" className="min-h-9 px-3" disabled={busy} onClick={reveal}>Show Wi-Fi password</Button>}
        </div>
        {p.changes?.length > 0 && <ul className="list-disc pl-5 text-xs text-ink-2">{p.changes.map(c => <li key={c}>{c}</li>)}</ul>}
        {p.error && <p className={`text-xs ${p.state === "failed" ? "font-semibold text-bad" : "text-ink-2"}`}>{p.error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-widest text-ink-3">Tags</span>
          {tags === null ? (
            <>
              {p.tags.length ? p.tags.map(t => <Badge key={t}>{t}</Badge>) : <span className="text-ink-3">none</span>}
              {canWrite && <button className="text-xs font-semibold text-plum underline" onClick={() => setTags(p.tags.join(", "))}>edit</button>}
            </>
          ) : (
            <>
              <input className={`${input} h-9 max-w-xs`} value={tags} onChange={e => setTags(e.target.value)} placeholder="pilot, test-bench" />
              <Button className="min-h-9 px-3" loading={busy} onClick={saveTags}>Save</Button>
              <Button variant="secondary" className="min-h-9 px-3" onClick={() => setTags(null)}>Cancel</Button>
            </>
          )}
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Apply template" size="max-w-lg"
        footer={<>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="danger" disabled={!form.templateId || !form.reason.trim() || !preview?.changes?.length} loading={busy} onClick={apply}>Apply</Button>
        </>}>
        <div className="grid gap-3">
          <p className="text-xs text-ink-2">This writes to the device. On customer ONUs, get network-team approval and prefer night hours. Behind CGNAT it applies at the next check-in.</p>
          <select className={input} value={form.templateId} onChange={set("templateId")}>
            <option value="">Pick a template</option>
            {templates.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input className={input} placeholder="SSID override" value={form.ssid} onChange={set("ssid")} />
            <input className={input} placeholder="5 GHz SSID override" value={form.ssid5} onChange={set("ssid5")} />
          </div>
          <input className={input} placeholder="Wi-Fi password override (8-63)" value={form.password} onChange={set("password")} />
          <input className={input} placeholder="Reason (required)" value={form.reason} onChange={set("reason")} />
          {preview?.error && <p className="text-xs font-semibold text-bad">{preview.error}</p>}
          {preview?.waiting && <p className="text-xs text-warn">{preview.waiting}</p>}
          {preview?.changes && (
            <div className="rounded-control bg-canvas p-3 text-xs">
              <b>Will set</b>
              {preview.changes.length ? <ul className="list-disc pl-5">{preview.changes.map(c => <li key={c}>{c}</li>)}</ul> : <p>Nothing on this device.</p>}
              {preview.skipped?.length > 0 && <><b>Skipped</b><ul className="list-disc pl-5">{preview.skipped.map(c => <li key={c}>{c}</li>)}</ul></>}
            </div>
          )}
        </div>
      </Modal>
    </Card>
  );
}
