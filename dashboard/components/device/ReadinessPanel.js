import { useCallback, useEffect, useState } from "react";
import api from "../../lib/api";
import { apiError } from "../../lib/format";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { Table, Row, Cell } from "../ui/Table";
import { useToast } from "../ui/Toast";

const ICON = { ok: "✓", warn: "!", bad: "✗" };

export default function ReadinessPanel({ deviceId }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    api.get(`/devices/${deviceId}/readiness`).then(({ data }) => setData(data)).catch(err => toast(apiError(err, "Failed to load readiness"), "bad"));
  }, [deviceId, toast]);
  useEffect(load, [load]);

  async function fullRefresh() {
    setBusy("refresh");
    try {
      const { status } = await api.post(`/devices/${deviceId}/refresh?scope=full`);
      toast(status === 202 ? "Queued; runs on next check-in. Re-check in a few minutes." : "Full parameter tree fetched.", status === 202 ? "warn" : "ok");
      load();
    } catch (err) {
      toast(apiError(err, "Full refresh failed"), "bad");
    } finally {
      setBusy("");
    }
  }

  async function capture() {
    setBusy("capture");
    try {
      const res = await api.get(`/devices/${deviceId}/capture`, { responseType: "blob" });
      const name = /filename="([^"]+)"/.exec(res.headers["content-disposition"] || "")?.[1] || "capture.json";
      const url = URL.createObjectURL(res.data);
      Object.assign(document.createElement("a"), { href: url, download: name }).click();
      URL.revokeObjectURL(url);
      toast("Capture downloaded. Keep this file.", "ok");
    } catch (err) {
      toast(apiError(err, "Capture failed"), "bad");
    } finally {
      setBusy("");
    }
  }

  const score = data ? data.items.filter(i => i.status === "ok").length : 0;
  return (
    <div className="grid gap-4">
      <Card title="Device readiness" action={
        <div className="flex gap-2">
          <Button variant="secondary" disabled={!!busy} onClick={fullRefresh}>{busy === "refresh" ? "Fetching all..." : "1. Fetch everything"}</Button>
          <Button variant="secondary" onClick={load}>2. Re-check</Button>
          <Button disabled={!!busy} onClick={capture}>{busy === "capture" ? "Preparing..." : "3. Download capture"}</Button>
        </div>
      }>
        <p className="mb-4 text-sm text-ink-2">Shows which features work on this model. With a new device: fetch everything, re-check, then download the capture file so paths can be mapped later without the device.</p>
        {!data && <p className="text-sm">Loading...</p>}
        {data && (
          <>
            <p className="mb-3 text-sm font-semibold text-plum">{score} / {data.items.length} checks passing · {data.leafCount} parameters · vendor extensions: {data.vendorExtensions.join(", ") || "none"}</p>
            <Table head={["", "Feature", "Result", "Path"]}>
              {data.items.map(i => (
                <Row key={i.feature}>
                  <Cell><Badge tone={i.status}>{ICON[i.status]}</Badge></Cell>
                  <Cell className="font-semibold">{i.feature}</Cell>
                  <Cell className="break-all">{i.detail}</Cell>
                  <Cell mono className="break-all text-ink-2">{i.path}</Cell>
                </Row>
              ))}
            </Table>
          </>
        )}
      </Card>
      {data?.opticalCandidates?.length > 0 && (
        <Card title="Optical / PON parameters found">
          <Table head={["Path", "Value"]}>
            {data.opticalCandidates.map(c => <Row key={c.path}><Cell mono className="break-all">{c.path}</Cell><Cell>{String(c.value ?? "—")}</Cell></Row>)}
          </Table>
        </Card>
      )}
      {data?.profile && (
        <Card title={`Learned profile${data.profile.verified ? " (verified)" : " (auto, unverified)"}`}>
          <Table head={["Key", "Path"]}>
            {Object.entries(data.profile.parameterMap || {}).map(([k, v]) => <Row key={k}><Cell>{k}</Cell><Cell mono className="break-all">{v}</Cell></Row>)}
          </Table>
        </Card>
      )}
    </div>
  );
}
