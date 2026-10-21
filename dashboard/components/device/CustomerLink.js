import { useEffect, useState } from "react";
import api from "../../lib/api";
import { apiError } from "../../lib/format";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import { useToast } from "../ui/Toast";

const input = "h-11 w-full rounded-control border border-line bg-white px-4 text-sm outline-none focus:border-plum";

export default function CustomerLink({ device, onChange }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [form, setForm] = useState({ name: "", phone: "", accountId: "", address: "" });
  const [busy, setBusy] = useState(false);
  const c = device.customer;

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => api.get("/customers", { params: { q } }).then(({ data }) => setResults(data)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q, open]);

  async function link(customerId) {
    setBusy(true);
    try {
      const { data } = await api.put(`/devices/${device._id}/customer`, { customerId });
      onChange(data);
      setOpen(false);
      toast(customerId ? "Customer linked" : "Customer unlinked", "ok");
    } catch (err) {
      toast(apiError(err, "Link failed"), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function createAndLink(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/customers", form);
      await link(data._id);
    } catch (err) {
      toast(apiError(err, "Could not create customer"), "bad");
      setBusy(false);
    }
  }

  return (
    <>
      {c ? (
        <div className="flex items-center gap-3">
          <div>
            <div className="text-sm font-bold text-plum">{c.name}</div>
            <div className="font-mono text-xs text-ink-2">{[c.accountId, c.phone].filter(Boolean).join(" · ")}</div>
          </div>
          <Button variant="secondary" className="min-h-9 px-3" onClick={() => setOpen(true)}>Change</Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>Link customer</Button>
      )}
      {open && (
        <Modal open onClose={() => setOpen(false)} title="Link customer" footer={c && <Button variant="danger" disabled={busy} onClick={() => link(null)}>Unlink</Button>}>
          <input className={input} autoFocus placeholder="Search name, phone, account ID" value={q} onChange={e => setQ(e.target.value)} />
          <ul className="mt-2 max-h-48 overflow-y-auto">
            {results.map(r => (
              <li key={r._id}>
                <button disabled={busy} onClick={() => link(r._id)} className="w-full rounded-control px-3 py-2 text-left hover:bg-canvas">
                  <span className="font-semibold text-plum">{r.name}</span> <span className="font-mono text-xs text-ink-2">{r.accountId} {r.phone}</span>
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={createAndLink} className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-3">Or create new</p>
            <input className={input} required placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input className={input} required placeholder="Account ID *" value={form.accountId} onChange={e => setForm({ ...form, accountId: e.target.value })} />
            <input className={input} placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <input className={input} placeholder="Address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            <Button type="submit" disabled={busy}>Create and link</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
