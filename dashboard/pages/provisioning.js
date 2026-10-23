import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import api from "../lib/api";
import { useUser, can } from "../lib/session";
import { apiError, when, PROV_TONE, PROV_LABEL } from "../lib/format";
import Shell from "../components/Shell";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import TemplateForm from "../components/TemplateForm";
import PreRegisterForm from "../components/PreRegisterForm";
import { Table, Row, Cell } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";
import useAction from "../lib/useAction";

const STATUS_TONE = { waiting: "warn", matched: "ok", cancelled: "muted" };
const FIELDS = ["name", "description", "match", "priority", "wifi", "params", "tags", "isActive", "autoApplyToNew"];
const pick = f => Object.fromEntries(FIELDS.map(k => [k, f[k]]));

function wifiSummary(t) {
  const w = t.wifi || {};
  const parts = [w.ssid && `SSID ${w.ssid}`, w.password === "generate" && "random password"].filter(Boolean);
  return parts.join(" · ") || "Wi-Fi unchanged";
}

export default function Provisioning() {
  const toast = useToast();
  const user = useUser();
  const [templates, setTemplates] = useState([]);
  const [pres, setPres] = useState([]);
  const [status, setStatus] = useState("waiting");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [preReg, setPreReg] = useState(false);
  const [busy, run] = useAction();

  const loadTemplates = useCallback(() => api.get("/templates").then(({ data }) => setTemplates(data)).catch(err => toast(apiError(err, "Failed to load templates"), "bad")), [toast]);
  const loadPres = useCallback(() => api.get("/preregistrations", { params: { status: status || undefined, q: q || undefined } }).then(({ data }) => setPres(data)).catch(() => {}), [status, q]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    const t = setTimeout(loadPres, q ? 300 : 0);
    const poll = setInterval(loadPres, 30000);
    return () => { clearTimeout(t); clearInterval(poll); };
  }, [loadPres, q]);

  const isAdmin = can(user, "template.write");
  const canWrite = can(user, "prereg.write");
  const canSecret = can(user, "secret.view");

  const save = form => run(async () => {
    try {
      if (editing._id) await api.patch(`/templates/${editing._id}`, pick(form));
      else await api.post("/templates", pick(form));
      toast("Template saved", "ok");
      setEditing(null);
      loadTemplates();
    } catch (err) {
      toast(apiError(err, "Save failed"), "bad");
    }
  });

  const removeTemplate = t => run(async () => {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    try {
      await api.delete(`/templates/${t._id}`);
      toast("Template deleted", "ok");
      loadTemplates();
    } catch (err) {
      toast(apiError(err, "Delete failed"), "bad");
    }
  });

  const cancelPre = p => run(async () => {
    try {
      await api.post(`/preregistrations/${p._id}/cancel`);
      toast("Cancelled", "ok");
      loadPres();
    } catch (err) {
      toast(apiError(err, "Cancel failed"), "bad");
    }
  });

  const reveal = p => run(async () => {
    try {
      const { data } = await api.get(`/preregistrations/${p._id}/secret`);
      toast(data.wifiPassword ? `Wi-Fi password: ${data.wifiPassword}` : "No password set", "muted", { duration: 15000 });
    } catch (err) {
      toast(apiError(err, "Failed"), "bad");
    }
  });

  return (
    <Shell title="Provisioning">
      <div className="grid gap-4">
        <Card title="Templates" action={isAdmin && <Button onClick={() => setEditing({})}>New template</Button>}>
          {!templates.length && <p className="text-sm text-ink-2">No templates yet. A template sets Wi-Fi names/passwords, extra parameters and tags on a device.</p>}
          {templates.length > 0 && (
            <Table head={["Name", "Applies to", "Changes", "Mode", "Usage", ""]}>
              {templates.map(t => (
                <Row key={t._id} className={t.isActive ? "" : "opacity-50"}>
                  <Cell><span className="font-semibold text-plum">{t.name}</span>{t.description && <div className="text-xs text-ink-2">{t.description}</div>}</Cell>
                  <Cell>{[t.match?.manufacturer, t.match?.productClass].filter(Boolean).join(" ") || "Any device"}{t.priority ? <span className="text-xs text-ink-3"> · p{t.priority}</span> : null}</Cell>
                  <Cell>{wifiSummary(t)}{t.params?.length ? ` · ${t.params.length} param(s)` : ""}{t.tags?.length ? ` · tags ${t.tags.join(", ")}` : ""}</Cell>
                  <Cell>{!t.isActive ? <Badge>inactive</Badge> : t.autoApplyToNew ? <Badge tone="warn">auto: new devices</Badge> : <Badge tone="ok">pre-reg / manual</Badge>}</Cell>
                  <Cell>{Object.entries(t.usage || {}).map(([s, n]) => <Badge key={s} tone={PROV_TONE[s]}>{n} {s}</Badge>)}</Cell>
                  <Cell className="space-x-2 whitespace-nowrap text-right">
                    {isAdmin && <>
                      <Button variant="secondary" className="min-h-9 px-3" onClick={() => setEditing(t)}>Edit</Button>
                      <Button variant="secondary" className="min-h-9 px-3" disabled={busy} onClick={() => removeTemplate(t)}>Delete</Button>
                    </>}
                  </Cell>
                </Row>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Pre-registrations" action={canWrite && <Button onClick={() => setPreReg(true)}>Pre-register device</Button>}>
          <div className="mb-4 flex flex-wrap gap-3">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search serial, MAC, customer or note" className="h-11 w-full max-w-md rounded-control border border-line bg-white px-4 text-sm outline-none focus:border-plum" />
            <select value={status} onChange={e => setStatus(e.target.value)} className="h-11 rounded-control border border-line bg-white px-3 text-sm">
              <option value="waiting">Waiting</option><option value="matched">Matched</option><option value="cancelled">Cancelled</option><option value="">All</option>
            </select>
          </div>
          {!pres.length && <p className="text-sm text-ink-2">Nothing here. Pre-register a device by serial or label MAC before installation; when it first checks in it is linked to the customer and the template is applied.</p>}
          {pres.length > 0 && (
            <Table head={["Status", "Serial / MAC", "Customer", "Template", "Device", "Created", ""]}>
              {pres.map(p => (
                <Row key={p._id}>
                  <Cell><Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge></Cell>
                  <Cell mono>{p.serialNumber}{p.serialNumber && p.macAddress && <br />}{p.macAddress}</Cell>
                  <Cell>{p.customer ? <Link href={`/customers/${p.customer._id}`} className="font-semibold text-plum underline">{p.customer.name}</Link> : null}</Cell>
                  <Cell>{p.template?.name}</Cell>
                  <Cell>{p.device ? <>
                    <Link href={`/devices/${p.device._id}`} className="font-mono text-xs underline">{p.device.serialNumber}</Link>
                    {p.device.provisioning?.state && <div className="mt-1"><Badge tone={PROV_TONE[p.device.provisioning.state]}>{PROV_LABEL[p.device.provisioning.state]}</Badge></div>}
                  </> : null}</Cell>
                  <Cell>{when(p.createdAt)}<div className="text-xs text-ink-2">{p.createdBy?.name}</div></Cell>
                  <Cell className="space-x-2 whitespace-nowrap text-right">
                    {canSecret && p.template && <Button variant="secondary" className="min-h-9 px-3" disabled={busy} onClick={() => reveal(p)}>Password</Button>}
                    {canWrite && p.status === "waiting" && <Button variant="secondary" className="min-h-9 px-3" disabled={busy} onClick={() => cancelPre(p)}>Cancel</Button>}
                  </Cell>
                </Row>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?._id ? `Edit ${editing.name}` : "New template"} size="max-w-2xl">
        {editing && <TemplateForm initial={editing._id ? editing : null} busy={busy} onSubmit={save} onCancel={() => setEditing(null)} />}
      </Modal>
      <Modal open={preReg} onClose={() => setPreReg(false)} title="Pre-register device" size="max-w-lg">
        {preReg && <PreRegisterForm onDone={() => { setPreReg(false); loadPres(); }} onCancel={() => setPreReg(false)} />}
      </Modal>
    </Shell>
  );
}
