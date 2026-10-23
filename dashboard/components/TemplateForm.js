import { useEffect, useState } from "react";
import api from "../lib/api";
import { input } from "../lib/format";
import Button from "./ui/Button";

const TYPES = ["xsd:string", "xsd:boolean", "xsd:unsignedInt", "xsd:int"];
const blank = { name: "", description: "", match: { manufacturer: "", productClass: "" }, priority: 0, wifi: { ssid: "", ssid5: "", password: "keep" }, params: [], tags: "", isActive: true, autoApplyToNew: false };

export default function TemplateForm({ initial, busy, onSubmit, onCancel }) {
  const [f, setF] = useState(() => (initial ? { ...blank, ...initial, wifi: { ...blank.wifi, ...initial.wifi }, match: { ...blank.match, ...initial.match }, tags: (initial.tags || []).join(", ") } : blank));
  const [profiles, setProfiles] = useState([]);
  useEffect(() => {
    api.get("/profiles").then(({ data }) => setProfiles(data)).catch(() => {});
  }, []);
  const touchesWifi = f.wifi.ssid || f.wifi.ssid5 || f.wifi.password === "generate";
  const setParam = (i, k, v) => setF({ ...f, params: f.params.map((p, j) => (j === i ? { ...p, [k]: v } : p)) });

  return (
    <form className="grid max-h-[75vh] gap-3 overflow-y-auto pr-1 text-sm" onSubmit={e => { e.preventDefault(); onSubmit(f); }}>
      <input className={input} required placeholder="Name, e.g. Default residential" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <input className={input} placeholder="Description" value={f.description || ""} onChange={e => setF({ ...f, description: e.target.value })} />

      <fieldset className="grid grid-cols-[1fr_1fr_90px] gap-2">
        <legend className="mb-1 font-mono text-[11px] uppercase tracking-widest text-ink-3">Applies to (blank = any)</legend>
        <input className={input} list="mfrs" placeholder="Manufacturer" value={f.match.manufacturer} onChange={e => setF({ ...f, match: { ...f.match, manufacturer: e.target.value } })} />
        <input className={input} list="classes" placeholder="Product class" value={f.match.productClass} onChange={e => setF({ ...f, match: { ...f.match, productClass: e.target.value } })} />
        <input className={input} type="number" title="Priority" value={f.priority} onChange={e => setF({ ...f, priority: e.target.value })} />
        <datalist id="mfrs">{[...new Set(profiles.map(p => p.manufacturer))].map(m => <option key={m} value={m} />)}</datalist>
        <datalist id="classes">{profiles.map(p => <option key={p._id} value={p.productClass} />)}</datalist>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1 font-mono text-[11px] uppercase tracking-widest text-ink-3">Wi-Fi</legend>
        <div className="grid grid-cols-2 gap-2">
          <input className={input} placeholder="SSID pattern, e.g. FAB5-{serial4}" value={f.wifi.ssid} onChange={e => setF({ ...f, wifi: { ...f.wifi, ssid: e.target.value } })} />
          <input className={input} placeholder="5 GHz SSID (blank = SSID-5G)" value={f.wifi.ssid5} onChange={e => setF({ ...f, wifi: { ...f.wifi, ssid5: e.target.value } })} />
        </div>
        <select className={input} value={f.wifi.password} onChange={e => setF({ ...f, wifi: { ...f.wifi, password: e.target.value } })}>
          <option value="keep">Password: keep (unless set at pre-registration)</option>
          <option value="generate">Password: generate a random 12-character one</option>
        </select>
        <p className="text-xs text-ink-2">Tokens: {"{serial4} {serial6} {mac4} {mac6} {account} {phone4}"}. Only the main SSID per band is changed.</p>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1 font-mono text-[11px] uppercase tracking-widest text-ink-3">Extra parameters</legend>
        {f.params.map((p, i) => (
          <div key={i} className="grid grid-cols-[1fr_120px_120px_36px] gap-2">
            <input className={`${input} font-mono text-xs`} placeholder="InternetGatewayDevice.Time.NTPServer1" value={p.path} onChange={e => setParam(i, "path", e.target.value)} />
            <input className={input} placeholder="Value" value={String(p.value ?? "")} onChange={e => setParam(i, "value", e.target.value)} />
            <select className={input} value={p.type} onChange={e => setParam(i, "type", e.target.value)}>{TYPES.map(t => <option key={t}>{t}</option>)}</select>
            <button type="button" aria-label="Remove" className="text-lg text-ink-3 hover:text-bad" onClick={() => setF({ ...f, params: f.params.filter((_, j) => j !== i) })}>×</button>
          </div>
        ))}
        <button type="button" className="justify-self-start text-sm font-semibold text-plum underline" onClick={() => setF({ ...f, params: [...f.params, { path: "", value: "", type: "xsd:string" }] })}>Add parameter</button>
        <p className="text-xs text-ink-2">Parameters the device does not have are skipped. ACS URL, credentials and inform settings are managed by the ACS and refused.</p>
      </fieldset>

      <input className={input} placeholder="Tags added to the device, comma separated" value={f.tags} onChange={e => setF({ ...f, tags: e.target.value })} />
      <label className="flex items-center gap-2"><input type="checkbox" checked={f.isActive} onChange={e => setF({ ...f, isActive: e.target.checked })} /> Active</label>
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-1" disabled={!!touchesWifi} checked={f.autoApplyToNew && !touchesWifi} onChange={e => setF({ ...f, autoApplyToNew: e.target.checked })} />
        <span>Apply to every device that registers from now on{touchesWifi && <span className="block text-xs text-ink-2">Not available for templates that change Wi-Fi: existing customers would lose their Wi-Fi when the OLT pushes the ACS URL. Use pre-registration.</span>}</span>
      </label>

      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={busy}>Save</Button>
      </div>
    </form>
  );
}
