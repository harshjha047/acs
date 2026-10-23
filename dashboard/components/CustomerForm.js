import { useState } from "react";
import Button from "./ui/Button";
import { input } from "../lib/format";

const FIELDS = [["name", "Name", true], ["accountId", "Account ID", true], ["phone", "Phone"], ["email", "Email"], ["address", "Address"]];

export default function CustomerForm({ initial = {}, busy, submitLabel = "Save", onSubmit, onCancel }) {
  const [form, setForm] = useState(() => Object.fromEntries(FIELDS.map(([k]) => [k, initial[k] || ""])));
  return (
    <form className="grid gap-3" onSubmit={e => { e.preventDefault(); onSubmit(form); }}>
      {FIELDS.map(([k, label, required]) => (
        <input key={k} className={input} required={required} type={k === "email" ? "email" : "text"} placeholder={label} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} />
      ))}
      <div className="mt-3 flex justify-end gap-2">
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" loading={busy}>{submitLabel}</Button>
      </div>
    </form>
  );
}
