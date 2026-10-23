import { useEffect, useState } from "react";
import api from "../lib/api";
import { apiError, input } from "../lib/format";
import Button from "./ui/Button";
import { useToast } from "./ui/Toast";
import useAction from "../lib/useAction";

const empty = { serialNumber: "", macAddress: "", templateId: "", ssid: "", ssid5: "", wifiPassword: "", tags: "", note: "" };

export default function PreRegisterForm({ customer, onDone, onCancel }) {
  const toast = useToast();
  const [form, setForm] = useState(empty);
  const [templates, setTemplates] = useState([]);
  const [mode, setMode] = useState(customer ? "fixed" : "existing");
  const [q, setQ] = useState("");
  const [found, setFound] = useState([]);
  const [picked, setPicked] = useState(customer || null);
  const [newCust, setNewCust] = useState({ name: "", accountId: "", phone: "" });
  const [result, setResult] = useState(null);
  const [busy, run] = useAction();
  const set = k => e => setForm({ ...form, [k]: e.target.value });
  const tpl = templates.find(t => t._id === form.templateId);

  useEffect(() => {
    api.get("/templates").then(({ data }) => setTemplates(data.filter(t => t.isActive))).catch(() => {});
  }, []);

  useEffect(() => {
    if (mode !== "existing" || !q.trim()) return setFound([]);
    const t = setTimeout(() => api.get("/customers", { params: { q } }).then(({ data }) => setFound(data)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q, mode]);

  const submit = e => {
    e.preventDefault();
    run(async () => {
      const body = { ...form, tags: form.tags, ...(mode === "new" ? { customer: newCust } : { customerId: picked?._id }) };
      try {
        const { data } = await api.post("/preregistrations", body);
        toast("Pre-registered. It is linked automatically when the device first checks in.", "ok");
        if (data.wifiPassword) setResult(data);
        else onDone(data);
      } catch (err) {
        toast(apiError(err, "Pre-registration failed"), "bad");
      }
    });
  };

  if (result) {
    return (
      <div className="grid gap-3">
        <p>Give the customer this Wi-Fi password. It is applied when the device first checks in.</p>
        <code className="rounded-control bg-canvas px-4 py-3 font-mono text-lg">{result.wifiPassword}</code>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(result.wifiPassword).then(() => toast("Copied", "ok"))}>Copy</Button>
          <Button onClick={() => onDone(result)}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <form className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1" onSubmit={submit}>
      <div className="grid grid-cols-2 gap-2">
        <input className={input} placeholder="Serial number" value={form.serialNumber} onChange={set("serialNumber")} />
        <input className={input} placeholder="WAN MAC (label)" value={form.macAddress} onChange={set("macAddress")} />
      </div>
      <p className="-mt-1 text-xs text-ink-2">Either is enough. Realtek ONUs report a MAC-based serial; the label MAC is the safer choice.</p>

      {mode === "fixed" ? (
        <p className="text-sm">Customer: <b>{picked.name}</b> ({picked.accountId})</p>
      ) : (
        <>
          <div className="flex gap-4 text-sm">
            {[["existing", "Existing customer"], ["new", "New customer"], ["none", "No customer"]].map(([k, l]) => (
              <label key={k} className="flex items-center gap-1"><input type="radio" checked={mode === k} onChange={() => setMode(k)} />{l}</label>
            ))}
          </div>
          {mode === "existing" && (picked ? (
            <p className="text-sm">Customer: <b>{picked.name}</b> ({picked.accountId}) <button type="button" className="ml-2 underline" onClick={() => setPicked(null)}>change</button></p>
          ) : (
            <>
              <input className={input} placeholder="Search customer" value={q} onChange={e => setQ(e.target.value)} />
              {found.slice(0, 6).map(c => (
                <button type="button" key={c._id} className="rounded-control border border-line px-3 py-2 text-left text-sm hover:bg-canvas" onClick={() => setPicked(c)}>
                  <b>{c.name}</b> <span className="font-mono text-xs">{c.accountId}</span> {c.phone}
                </button>
              ))}
            </>
          ))}
          {mode === "new" && (
            <div className="grid grid-cols-3 gap-2">
              {[["name", "Name"], ["accountId", "Account ID"], ["phone", "Phone"]].map(([k, l]) => (
                <input key={k} className={input} placeholder={l} required={k !== "phone"} value={newCust[k]} onChange={e => setNewCust({ ...newCust, [k]: e.target.value })} />
              ))}
            </div>
          )}
        </>
      )}

      <select className={input} value={form.templateId} onChange={set("templateId")}>
        <option value="">No template (link only)</option>
        {templates.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
      </select>
      {tpl && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <input className={input} placeholder={tpl.wifi?.ssid ? `SSID (default ${tpl.wifi.ssid})` : "SSID (unchanged)"} value={form.ssid} onChange={set("ssid")} />
            <input className={input} placeholder="5 GHz SSID (default SSID-5G)" value={form.ssid5} onChange={set("ssid5")} />
          </div>
          <input className={input} placeholder={tpl.wifi?.password === "generate" ? "Wi-Fi password (blank = generate)" : "Wi-Fi password (blank = unchanged)"} value={form.wifiPassword} onChange={set("wifiPassword")} />
        </>
      )}
      <input className={input} placeholder="Tags, comma separated" value={form.tags} onChange={set("tags")} />
      <input className={input} placeholder="Note (optional)" value={form.note} onChange={set("note")} />
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={busy}>Pre-register</Button>
      </div>
    </form>
  );
}
