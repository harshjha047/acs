import { useCallback, useEffect, useState } from "react";
import api from "../../lib/api";
import { apiError, errTone, input, when, FW_TONE, FW_LABEL } from "../../lib/format";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import { useToast } from "../ui/Toast";
import useAction from "../../lib/useAction";

const RESULT_TONE = { success: "ok", failed: "bad", pending: "warn" };

export default function FirmwareCard({ deviceId, serial, role }) {
  const toast = useToast();
  const [f, setF] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ releaseId: "", reason: "", confirmSerial: "", reprovision: true });
  const [busy, run] = useAction();
  const isAdmin = role === "admin";

  const load = useCallback(() => api.get(`/devices/${deviceId}/firmware`).then(({ data }) => setF(data)).catch(() => {}), [deviceId]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const close = () => {
    setModal(null);
    setForm({ releaseId: "", reason: "", confirmSerial: "", reprovision: true });
  };

  const submit = () => run(async () => {
    try {
      if (modal === "push") {
        const { data } = await api.post(`/devices/${deviceId}/firmware`, { releaseId: form.releaseId, reason: form.reason });
        toast(data.state === "downloading" ? "Download started on the device" : "Queued. It starts at the next check-in.", data.state === "downloading" ? "ok" : "warn");
      } else {
        await api.post(`/devices/${deviceId}/factory-reset`, form);
        toast("Factory reset queued. Expect the device offline for a few minutes.", "warn");
      }
      close();
      load();
    } catch (err) {
      toast(apiError(err, "Failed"), errTone(err));
    }
  });

  if (!f) return null;
  const eligible = f.releases.filter(r => r.ok);
  const set = k => e => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  return (
    <Card title="Firmware" action={isAdmin && (
      <div className="flex gap-2">
        <Button variant="secondary" className="min-h-9 px-3" disabled={!!f.active || !f.supported || !eligible.length} onClick={() => setModal("push")}>Upgrade</Button>
        <Button variant="danger" className="min-h-9 px-3" disabled={!!f.active} onClick={() => setModal("reset")}>Factory reset</Button>
      </div>
    )}>
      <div className="grid gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs">{f.softwareVersion || "unknown"}</span>
          {!f.supported && <span className="text-xs text-ink-3">Upgrades not enabled for this model</span>}
          {f.active && <Badge tone={FW_TONE[f.active.state]}>{FW_LABEL[f.active.state]} → {f.active.toVersion}</Badge>}
        </div>
        {f.jobs.length > 0 && (
          <ul className="grid gap-1 text-xs text-ink-2">
            {f.jobs.slice(0, 5).map(j => (
              <li key={j._id} className="flex flex-wrap gap-2">
                <Badge tone={FW_TONE[j.state]}>{FW_LABEL[j.state]}</Badge>
                <span>{j.fromVersion || "?"} → {j.toVersion || j.release?.version}</span>
                <span>{when(j.createdAt)}{j.requestedBy ? ` · ${j.requestedBy.name}` : ""}{j.rollout ? " · rollout" : ""}</span>
                {j.error && <span className="text-bad">{j.error}</span>}
              </li>
            ))}
          </ul>
        )}
        {f.resets.length > 0 && (
          <ul className="grid gap-1 text-xs text-ink-2">
            {f.resets.map(r => (
              <li key={r.at} className="flex flex-wrap gap-2">
                <Badge tone={RESULT_TONE[r.result]}>Factory reset · {r.result}</Badge>
                <span>{when(r.at)}{r.user ? ` · ${r.user}` : ""}</span>
                {r.details?.downtimeSec !== undefined && <span>back after {r.details.downtimeSec}s</span>}
                {r.error && <span className="text-bad">{r.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={modal === "push"} onClose={close} title="Firmware upgrade" size="max-w-lg"
        footer={<>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button variant="danger" disabled={!form.releaseId || !form.reason.trim()} loading={busy} onClick={submit}>Upgrade</Button>
        </>}>
        <div className="grid gap-3">
          <p className="text-xs text-ink-2">Bench or approved test devices only. The device downloads, flashes and reboots; a bad image can brick it. See docs/Firmware-Runbook.md before the first push.</p>
          <select className={input} value={form.releaseId} onChange={set("releaseId")}>
            <option value="">Pick a release</option>
            {f.releases.map(r => <option key={r._id} value={r._id} disabled={!r.ok}>{r.version} ({r.status}){r.ok ? "" : ` · ${r.reason}`}</option>)}
          </select>
          <input className={input} placeholder="Reason (required)" value={form.reason} onChange={set("reason")} />
        </div>
      </Modal>

      <Modal open={modal === "reset"} onClose={close} title="Factory reset" size="max-w-lg"
        footer={<>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button variant="danger" disabled={form.confirmSerial.trim().toLowerCase() !== String(serial).toLowerCase() || !form.reason.trim()} loading={busy} onClick={submit}>Reset device</Button>
        </>}>
        <div className="grid gap-3">
          <p className="text-xs text-ink-2">Erases all settings (Wi-Fi, PPPoE, ACS URL). The OLT must re-push the ACS settings before the device returns. Customer ONUs need network-team approval.</p>
          <label className="text-xs">Type the serial <b className="font-mono">{serial}</b> to confirm</label>
          <input className={`${input} font-mono`} value={form.confirmSerial} onChange={set("confirmSerial")} autoComplete="off" />
          <input className={input} placeholder="Reason (required)" value={form.reason} onChange={set("reason")} />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={form.reprovision} onChange={set("reprovision")} />
            Re-apply the last provisioning template when it comes back
          </label>
        </div>
      </Modal>
    </Card>
  );
}
