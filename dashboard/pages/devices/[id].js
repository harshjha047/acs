import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import api from "../../lib/api";
import { useUser, can } from "../../lib/session";
import { ago, apiError, errTone, onlineState, ALERT_LABEL, SEVERITY_TONE } from "../../lib/format";
import Shell from "../../components/Shell";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Field from "../../components/ui/Field";
import Modal from "../../components/ui/Modal";
import { useToast } from "../../components/ui/Toast";
import HealthCard from "../../components/device/HealthCard";
import OpticalCard from "../../components/device/OpticalCard";
import WifiPanel from "../../components/device/WifiPanel";
import ClientsPanel from "../../components/device/ClientsPanel";
import ToolsPanel from "../../components/device/ToolsPanel";
import TimelinePanel from "../../components/device/TimelinePanel";
import ReadinessPanel from "../../components/device/ReadinessPanel";
import ParamsTable from "../../components/device/ParamsTable";
import TrendsPanel from "../../components/device/TrendsPanel";
import CustomerLink from "../../components/device/CustomerLink";
import ProvisionCard from "../../components/device/ProvisionCard";
import FirmwareCard from "../../components/device/FirmwareCard";

const TABS = [
  ["overview", "Overview"],
  ["trends", "Trends & events"],
  ["wifi", "Wi-Fi & devices"],
  ["tools", "Tools"],
  ["timeline", "History & notes"],
  ["readiness", "Readiness"],
  ["params", "All parameters"]
];

export default function DeviceDetail() {
  const router = useRouter();
  const { id } = router.query;
  const toast = useToast();
  const [device, setDevice] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [reason, setReason] = useState("");
  const [version, setVersion] = useState(0);
  const user = useUser();


  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    try {
      const [d, s] = await Promise.all([api.get(`/devices/${id}`), api.get(`/devices/${id}/summary`)]);
      setDevice(d.data);
      setSummary(s.data);
    } catch (err) {
      setError(apiError(err, "Failed to load device"));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!id) return undefined;
    const t = setInterval(() => api.get(`/devices/${id}`).then(({ data }) => setDevice(data)).catch(() => {}), 30000);
    return () => clearInterval(t);
  }, [id]);
  useEffect(() => { if (router.query.tab) setTab(String(router.query.tab)); }, [router.query.tab]);

  async function refresh() {
    setBusy("refresh");
    const tid = toast.loading("Asking the device for live values…");
    try {
      const { status } = await api.post(`/devices/${id}/refresh?scope=summary`);
      toast(status === 202 ? "Queued. Device is not reachable now; values update after its next check-in." : "Live values fetched.", status === 202 ? "warn" : "ok", { id: tid });
      await load();
      setVersion(v => v + 1);
    } catch (err) {
      toast(apiError(err, "Refresh failed"), errTone(err), { id: tid });
    } finally {
      setBusy("");
    }
  }

  async function act() {
    const kind = confirm;
    setBusy(kind);
    try {
      if (kind === "reboot") {
        const { status } = await api.post(`/devices/${id}/reboot`, { reason });
        toast(status === 202 ? "Reboot queued; runs when the device next checks in." : "Reboot sent. Device will be offline for 1-3 minutes.", status === 202 ? "warn" : "ok");
      } else {
        await api.delete(`/devices/${id}`, { data: { reason } });
        toast("Device removed.", "ok");
        router.replace("/devices");
      }
      closeConfirm();
    } catch (err) {
      toast(apiError(err, `${kind === "reboot" ? "Reboot" : "Remove"} failed`), errTone(err));
    } finally {
      setBusy("");
    }
  }

  function closeConfirm() {
    setConfirm(null);
    setReason("");
  }

  const online = device ? onlineState(device) : null;
  const tabBtn = name => `whitespace-nowrap rounded-control px-4 py-2 text-sm font-semibold ${tab === name ? "bg-plum text-white" : "text-ink-2 hover:bg-white"}`;

  return (
    <Shell title={device ? `Device ${device.serialNumber}` : "Device"}>
      {!device && !error && <p className="text-sm">Loading...</p>}
      {error && <p className="text-sm font-semibold text-bad">{error}</p>}

      {device && (
        <>
          <Card className="mb-4">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <dl className="grid grid-cols-2 gap-6 md:grid-cols-5">
                <Field label="Status">
                  <Badge tone={online === "online" ? "ok" : online === "offline" ? "bad" : "muted"}>{online || "…"}</Badge>
                  <span className="ml-2 text-xs font-normal text-ink-2">{ago(device.lastInformAt)}</span>
                </Field>
                <Field label="Manufacturer" value={device.manufacturer} />
                <Field label="Model" value={device.productClass} />
                <Field label="PPPoE / WAN IP" value={summary?.wan.primary?.Username || summary?.wan.primary?.ExternalIPAddress} mono />
                <Field label="Customer"><CustomerLink device={device} onChange={setDevice} /></Field>
              </dl>
              <div className="flex flex-wrap gap-2">
                {can(user, "device.refresh") && <Button variant="secondary" loading={busy === "refresh"} disabled={!!busy} onClick={refresh}>{busy === "refresh" ? "Fetching…" : "Refresh live"}</Button>}
                {can(user, "device.reboot") && <Button variant="danger" disabled={!!busy} onClick={() => setConfirm("reboot")}>Reboot</Button>}
                {can(user, "device.delete") && <Button variant="secondary" disabled={!!busy} onClick={() => setConfirm("remove")}>Remove</Button>}
              </div>
            </div>
          </Card>

          {device.alerts?.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {device.alerts.map(a => <Badge key={a._id} tone={SEVERITY_TONE[a.severity]}>{ALERT_LABEL[a.type] || a.type}: {a.message}</Badge>)}
            </div>
          )}

          <div className="mb-4 flex gap-2 overflow-x-auto">
            {TABS.map(([key, label]) => <button key={key} className={tabBtn(key)} onClick={() => setTab(key)}>{label}</button>)}
          </div>

          {tab === "overview" && summary && (
            <div className="grid gap-4 lg:grid-cols-2">
              <HealthCard summary={summary} />
              <div className="grid content-start gap-4">
                <OpticalCard optical={summary.optical} />
                <Card title="At a glance">
                  <dl className="grid grid-cols-2 gap-5 md:grid-cols-4">
                    <Field label="Active devices" value={summary.counts.activeClients} />
                    <Field label="On Wi-Fi" value={summary.counts.wifiClients} />
                    <Field label="LAN ports up" value={summary.counts.lanPortsUp} />
                    <Field label="Wi-Fi on" value={summary.wifi.filter(w => w.enabled).map(w => w.ssid).join(", ") || (summary.wifi.some(w => w.enabled === null) ? "unknown" : "none")} />
                  </dl>
                </Card>
                <ProvisionCard deviceId={id} user={user} />
                {can(user, "firmware.view") && <FirmwareCard deviceId={id} serial={device?.serialNumber} user={user} />}
              </div>
            </div>
          )}
          {tab === "trends" && <TrendsPanel deviceId={id} />}
          {tab === "wifi" && <div key={version} className="grid gap-4"><WifiPanel deviceId={id} /><ClientsPanel deviceId={id} /></div>}
          {tab === "tools" && <ToolsPanel deviceId={id} />}
          {tab === "timeline" && <TimelinePanel key={version} deviceId={id} />}
          {tab === "readiness" && <ReadinessPanel deviceId={id} />}
          {tab === "params" && <ParamsTable key={version} deviceId={id} />}
        </>
      )}

      <Modal
        open={!!confirm}
        onClose={closeConfirm}
        title={confirm === "remove" ? "Remove this device?" : "Reboot this device?"}
        footer={
          <>
            <Button variant="secondary" onClick={closeConfirm}>Cancel</Button>
            <Button variant="danger" loading={!!busy} disabled={!reason.trim()} onClick={act}>
              {confirm === "remove" ? "Remove" : "Reboot"}
            </Button>
          </>
        }
      >
        <p>
          {confirm === "remove"
            ? "Deletes it from the ACS. History is kept. A device with valid ACS credentials will reappear on its next check-in."
            : "The customer’s internet and Wi-Fi will drop for 1-3 minutes."}
        </p>
        <textarea
          className="mt-4 w-full rounded-control border border-line bg-white p-3 text-sm outline-none focus:border-plum"
          rows={3}
          maxLength={500}
          placeholder="Reason (required, saved to history)"
          value={reason}
          onChange={e => setReason(e.target.value)}
        />
      </Modal>
    </Shell>
  );
}
