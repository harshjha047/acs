import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import api from "../../lib/api";
import { ago, apiError } from "../../lib/format";
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
import CustomerLink from "../../components/device/CustomerLink";

const TABS = [
  ["overview", "Overview"],
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [version, setVersion] = useState(0);

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
  useEffect(() => { if (router.query.tab) setTab(String(router.query.tab)); }, [router.query.tab]);

  async function refresh() {
    setBusy("refresh");
    try {
      const { status } = await api.post(`/devices/${id}/refresh?scope=summary`);
      toast(status === 202 ? "Queued. Device is not reachable now; values update after its next check-in." : "Live values fetched.", status === 202 ? "warn" : "ok");
      await load();
      setVersion(v => v + 1);
    } catch (err) {
      toast(apiError(err, "Refresh failed"), "bad");
    } finally {
      setBusy("");
    }
  }

  async function reboot() {
    setBusy("reboot");
    try {
      const { status } = await api.post(`/devices/${id}/reboot`);
      toast(status === 202 ? "Reboot queued; runs when the device next checks in." : "Reboot sent. Device will be offline for 1-3 minutes.", status === 202 ? "warn" : "ok");
    } catch (err) {
      toast(apiError(err, "Reboot failed"), "bad");
    } finally {
      setBusy("");
      setConfirmOpen(false);
    }
  }

  const online = summary?.online.state;
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
                  <span className="ml-2 text-xs font-normal text-ink-2">{summary && ago(summary.lastInform)}</span>
                </Field>
                <Field label="Manufacturer" value={device.manufacturer} />
                <Field label="Model" value={device.productClass} />
                <Field label="PPPoE / WAN IP" value={summary?.wan.primary?.Username || summary?.wan.primary?.ExternalIPAddress} mono />
                <Field label="Customer"><CustomerLink device={device} onChange={setDevice} /></Field>
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={!!busy} onClick={refresh}>{busy === "refresh" ? "Fetching..." : "Refresh live"}</Button>
                <Button variant="danger" disabled={!!busy} onClick={() => setConfirmOpen(true)}>Reboot</Button>
              </div>
            </div>
          </Card>

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
                    <Field label="Wi-Fi on" value={summary.wifi.filter(w => w.enabled).map(w => w.ssid).join(", ") || "none"} />
                  </dl>
                </Card>
              </div>
            </div>
          )}
          {tab === "wifi" && <div key={version} className="grid gap-4"><WifiPanel deviceId={id} /><ClientsPanel deviceId={id} /></div>}
          {tab === "tools" && <ToolsPanel deviceId={id} />}
          {tab === "timeline" && <TimelinePanel key={version} deviceId={id} />}
          {tab === "readiness" && <ReadinessPanel deviceId={id} />}
          {tab === "params" && <ParamsTable key={version} deviceId={id} />}
        </>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Reboot this device?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="danger" disabled={busy === "reboot"} onClick={reboot}>{busy === "reboot" ? "Rebooting..." : "Reboot"}</Button>
          </>
        }
      >
        The customer’s internet and Wi-Fi will drop for 1-3 minutes.
      </Modal>
    </Shell>
  );
}
