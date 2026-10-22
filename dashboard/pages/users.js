import { useCallback, useEffect, useState } from "react";
import api from "../lib/api";
import { when, apiError } from "../lib/format";
import Shell from "../components/Shell";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import { useToast } from "../components/ui/Toast";
import useAction from "../lib/useAction";

const ROLES = [
  ["agent", "Agent: view, refresh, diagnostics, Wi-Fi"],
  ["noc", "NOC: agent + reboot"],
  ["admin", "Admin: everything + users, remove devices"]
];
const input = "h-11 w-full rounded-control border border-line bg-white px-4 text-sm outline-none focus:border-plum";
const empty = { name: "", email: "", password: "", role: "agent" };

export default function UsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null);
  const [resetFor, setResetFor] = useState(null);
  const [password, setPassword] = useState("");
  const [me, setMe] = useState(null);
  const [saving, setSaving] = useState(null);
  const [creating, runCreate] = useAction();

  const load = useCallback(() => {
    api.get("/users").then(({ data }) => setUsers(data)).catch(err => setError(apiError(err, "Failed to load users")));
  }, []);

  useEffect(() => {
    setMe(JSON.parse(localStorage.getItem("user") || "null"));
    load();
  }, [load]);

  async function patch(id, body, ok) {
    if (saving) return false;
    setSaving(id);
    try {
      await api.patch(`/users/${id}`, body);
      toast(ok, "ok");
      load();
      return true;
    } catch (err) {
      toast(apiError(err, "Update failed"), "bad");
      return false;
    } finally {
      setSaving(null);
    }
  }

  function create(e) {
    e.preventDefault();
    runCreate(async () => {
      try {
        await api.post("/users", form);
        toast("User created.", "ok");
        setForm(null);
        load();
      } catch (err) {
        toast(apiError(err, "Create failed"), "bad");
      }
    });
  }

  async function resetPassword() {
    if (await patch(resetFor._id, { password }, "Password changed.")) {
      setResetFor(null);
      setPassword("");
    }
  }

  return (
    <Shell title="Users">
      <Card>
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setForm(empty)}>Add user</Button>
        </div>
        {error && <p className="text-sm font-semibold text-bad">{error}</p>}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-widest text-ink-3">
              <th className="py-2">Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th />
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const self = u._id === me?.id;
              return (
                <tr key={u._id} className="border-b border-line/60">
                  <td className="py-3 font-semibold">{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      className="h-9 rounded-control border border-line bg-white px-2 text-sm"
                      value={u.role}
                      disabled={self || !!saving}
                      onChange={e => patch(u._id, { role: e.target.value }, "Role updated.")}
                    >
                      {ROLES.map(([r]) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td><Badge tone={u.isActive ? "ok" : "muted"}>{u.isActive ? "active" : "disabled"}</Badge></td>
                  <td>{when(u.lastLoginAt)}</td>
                  <td className="space-x-2 whitespace-nowrap text-right">
                    <Button variant="secondary" className="min-h-9 px-3" disabled={!!saving} onClick={() => setResetFor(u)}>Password</Button>
                    {!self && (
                      <Button variant="secondary" className="min-h-9 px-3" loading={saving === u._id} disabled={!!saving} onClick={() => patch(u._id, { isActive: !u.isActive }, u.isActive ? "User disabled." : "User enabled.")}>
                        {u.isActive ? "Disable" : "Enable"}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <ul className="mt-4 space-y-1 text-xs text-ink-2">
          {ROLES.map(([r, d]) => <li key={r}>{d}</li>)}
        </ul>
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title="Add user">
        {form && (
          <form id="user-form" onSubmit={create} className="grid gap-3">
            <input className={input} required placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input className={input} required type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <input className={input} required minLength={12} type="password" placeholder="Password (12+ characters)" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            <select className={input} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              {ROLES.map(([r, d]) => <option key={r} value={r}>{d}</option>)}
            </select>
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
              <Button type="submit" loading={creating}>{creating ? "Creating…" : "Create"}</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!resetFor}
        onClose={() => setResetFor(null)}
        title={`New password for ${resetFor?.name || ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetFor(null)}>Cancel</Button>
            <Button disabled={password.length < 12} loading={!!saving} onClick={resetPassword}>Save</Button>
          </>
        }
      >
        <input className={input} type="password" minLength={12} placeholder="12+ characters" value={password} onChange={e => setPassword(e.target.value)} />
      </Modal>
    </Shell>
  );
}
