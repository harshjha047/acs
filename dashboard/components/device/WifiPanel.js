import { useCallback, useEffect, useState } from "react";
import api from "../../lib/api";
import { apiError } from "../../lib/format";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import { Table, Row, Cell } from "../ui/Table";
import { useToast } from "../ui/Toast";

const input = "h-11 w-full rounded-control border border-line bg-white px-4 text-sm outline-none focus:border-plum disabled:bg-canvas";

function EditWifi({ deviceId, radio, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ ssid: radio.ssid || "", password: "", enabled: !!radio.enabled, hidden: !!radio.hidden, autoChannel: radio.autoChannel, channel: radio.channel ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const e = radio.editable;

  async function save() {
    setError("");
    const body = { id: radio.id };
    if (e.ssid && form.ssid !== radio.ssid) body.ssid = form.ssid;
    if (e.password && form.password) body.password = form.password;
    if (e.enabled && form.enabled !== !!radio.enabled) body.enabled = form.enabled;
    if (e.advertise && form.hidden !== !!radio.hidden) body.hidden = form.hidden;
    if (e.autoChannel && form.autoChannel !== radio.autoChannel) body.autoChannel = form.autoChannel;
    if (e.channel && !form.autoChannel && String(form.channel) !== String(radio.channel)) body.channel = Number(form.channel);
    if (Object.keys(body).length === 1) return setError("No changes");
    if (body.password !== undefined && (body.password.length < 8 || body.password.length > 63)) return setError("Password must be 8-63 characters");
    setBusy(true);
    try {
      const { status } = await api.put(`/devices/${deviceId}/wifi`, body);
      toast(status === 202 ? "Saved. Device is not reachable now; it applies on the next check-in." : "Wi-Fi updated on the device.", status === 202 ? "warn" : "ok");
      onSaved();
      onClose();
    } catch (err) {
      setError(apiError(err, "Update failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${radio.band || "Wi-Fi"} · ${radio.ssid || radio.id.split(".").slice(-1)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>{busy ? "Saving…" : "Save to device"}</Button></>}
    >
      <div className="flex flex-col gap-3">
        <label className="text-xs font-semibold">Network name (SSID)
          <input className={input} maxLength={32} value={form.ssid} disabled={!e.ssid} onChange={ev => set("ssid", ev.target.value)} />
        </label>
        <label className="text-xs font-semibold">New password <span className="font-normal text-ink-2">(leave blank to keep)</span>
          <input className={input} type="text" autoComplete="off" maxLength={63} value={form.password} disabled={!e.password} placeholder={e.password ? "8-63 characters" : "Not supported"} onChange={ev => set("password", ev.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} disabled={!e.enabled} onChange={ev => set("enabled", ev.target.checked)} /> Enabled</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.hidden} disabled={!e.advertise} onChange={ev => set("hidden", ev.target.checked)} /> Hide network</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.autoChannel} disabled={!e.autoChannel} onChange={ev => set("autoChannel", ev.target.checked)} /> Auto channel</label>
          <input className={input} type="number" min={1} max={196} placeholder="Channel" value={form.channel} disabled={!e.channel || form.autoChannel} onChange={ev => set("channel", ev.target.value)} />
        </div>
        {!form.enabled && radio.enabled && <p className="text-xs text-warn">Disabling disconnects every device on this network.</p>}
        {error && <p className="text-sm font-semibold text-bad">{error}</p>}
      </div>
    </Modal>
  );
}

export default function WifiPanel({ deviceId }) {
  const [radios, setRadios] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    api.get(`/devices/${deviceId}/wifi`).then(({ data }) => setRadios(data)).catch(err => setError(apiError(err, "Failed to load Wi-Fi")));
  }, [deviceId]);
  useEffect(load, [load]);

  return (
    <Card title="Wi-Fi networks">
      {error && <p className="text-sm font-semibold text-bad">{error}</p>}
      {!radios && !error && <p className="text-sm">Loading...</p>}
      {radios?.length === 0 && <p className="text-sm text-ink-2">No Wi-Fi interfaces reported.</p>}
      {radios?.length > 0 && (
        <Table head={["Band", "SSID", "Status", "Channel", "Clients", "Security", ""]}>
          {[...radios].sort((a, b) => b.enabled - a.enabled).map(r => (
            <Row key={r.id} className={r.enabled ? "" : "opacity-60"}>
              <Cell>{r.band || "?"}</Cell>
              <Cell><span className="font-semibold text-plum">{r.ssid || "—"}</span>{r.hidden && <span className="ml-2 text-xs text-ink-2">(hidden)</span>}</Cell>
              <Cell><Badge tone={r.enabled ? "ok" : "muted"}>{r.enabled === null ? "?" : r.enabled ? "on" : "off"}</Badge></Cell>
              <Cell>{r.autoChannel || r.channel === 0 ? `auto (${r.channelInUse ?? (r.channel || "?")})` : r.channel}</Cell>
              <Cell>{r.clients}</Cell>
              <Cell>{r.security}</Cell>
              <Cell className="text-right"><Button variant="secondary" className="min-h-9 px-3" onClick={() => setEditing(r)}>Edit</Button></Cell>
            </Row>
          ))}
        </Table>
      )}
      {editing && <EditWifi deviceId={deviceId} radio={editing} onClose={() => setEditing(null)} onSaved={() => setTimeout(load, 500)} />}
    </Card>
  );
}
