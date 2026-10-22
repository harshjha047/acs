import { useCallback, useEffect, useRef, useState } from "react";
import api from "../../lib/api";
import { apiError, errTone } from "../../lib/format";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { Table, Row, Cell } from "../ui/Table";
import { useToast } from "../ui/Toast";

const ICON = { ok: "✓", warn: "!", bad: "✗" };
const POLL_MS = 15000;
const WATCH_MS = 15 * 60 * 1000;

const mmss = sec => (sec <= 0 ? "any moment" : `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`);
const nextInformIn = d => (d?.lastInform ? (new Date(d.lastInform).getTime() + d.interval * 1000 - Date.now()) / 1000 : null);

function WatchBanner({ data, watch }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const eta = nextInformIn(data);
  const queued = data?.pendingTasks?.length || 0;
  return (
    <div className="animate-fade-up mb-4 overflow-hidden rounded-control border border-warn/30 bg-warn-bg">
      <div className="h-1 w-full overflow-hidden bg-warn/10"><div className="animate-progress h-full w-1/3 bg-warn/60" /></div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-sm text-plum">
        <span className="font-semibold">{queued ? "Waiting for the device to check in" : "Device is sending data"}</span>
        {eta !== null && queued > 0 && <span>next check-in ≈ <b className="font-mono">{mmss(eta)}</b></span>}
        <span>{queued} task{queued === 1 ? "" : "s"} queued</span>
        <span>{data?.leafCount ?? "…"} parameters · {data?.valuedPct ?? "…"}% values (was {watch.leafCount} · {watch.valuedPct}%)</span>
      </div>
    </div>
  );
}

export default function ReadinessPanel({ deviceId }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [watch, setWatch] = useState(null);
  const [changed, setChanged] = useState(new Set());
  const prev = useRef(null);

  const fetchData = useCallback(async () => {
    const { data: next } = await api.get(`/devices/${deviceId}/readiness`);
    if (prev.current) {
      const old = Object.fromEntries(prev.current.items.map(i => [i.feature, `${i.status}|${i.detail}`]));
      setChanged(new Set(next.items.filter(i => old[i.feature] !== `${i.status}|${i.detail}`).map(i => i.feature)));
    }
    prev.current = next;
    setData(next);
    return next;
  }, [deviceId]);

  useEffect(() => {
    fetchData().catch(err => toast(apiError(err, "Failed to load readiness"), "bad"));
  }, [fetchData, toast]);

  useEffect(() => {
    if (!watch) return;
    const timer = setInterval(async () => {
      try {
        const d = await fetchData();
        const grew = d.leafCount !== watch.leafCount || d.valued !== watch.valued;
        if (!d.pendingTasks.length && grew) {
          setWatch(null);
          toast(`Fetch complete: ${watch.leafCount} → ${d.leafCount} parameters, values ${watch.valuedPct}% → ${d.valuedPct}%`, "ok", { duration: 8000 });
        } else if (!d.pendingTasks.length && Date.now() - watch.since > 60000) {
          setWatch(null);
          toast("Device checked in but sent nothing new. Run Fetch everything again; if it stays the same, check the cwmp logs.", "warn", { duration: 9000 });
        } else if (Date.now() - watch.since > WATCH_MS) {
          setWatch(null);
          toast("Still waiting after 15 min. The device may be offline; tasks stay queued.", "warn", { duration: 9000 });
        }
      } catch {
        /* keep watching */
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [watch, fetchData, toast]);

  async function fullRefresh() {
    setBusy("refresh");
    const before = data;
    const id = toast.loading("Sending Fetch everything to the device…");
    try {
      const { status } = await api.post(`/devices/${deviceId}/refresh?scope=full`);
      const d = await fetchData();
      if (status === 202) {
        const eta = nextInformIn(d);
        toast(`Queued. The device is behind NAT, so it runs at its next check-in${eta !== null ? ` (≈ ${mmss(eta)})` : ""}. This page updates by itself.`, "warn", { id, duration: 7000 });
        const base = before || d;
        setWatch({ since: Date.now(), leafCount: base.leafCount, valued: base.valued, valuedPct: base.valuedPct });
      } else {
        toast(`Fetched live: ${d.leafCount} parameters, ${d.valuedPct}% values.`, "ok", { id });
      }
    } catch (err) {
      toast(apiError(err, "Fetch everything failed"), errTone(err), { id });
    } finally {
      setBusy("");
    }
  }

  async function recheck() {
    setBusy("recheck");
    try {
      const d = await fetchData();
      const ok = d.items.filter(i => i.status === "ok").length;
      toast(`Re-checked: ${ok} / ${d.items.length} passing, ${d.leafCount} parameters.`, "ok", { duration: 2500 });
    } catch (err) {
      toast(apiError(err, "Re-check failed"), "bad");
    } finally {
      setBusy("");
    }
  }

  async function capture() {
    setBusy("capture");
    const id = toast.loading("Preparing capture…");
    try {
      const res = await api.get(`/devices/${deviceId}/capture`, { responseType: "blob" });
      const name = /filename="([^"]+)"/.exec(res.headers["content-disposition"] || "")?.[1] || "capture.json";
      const url = URL.createObjectURL(res.data);
      Object.assign(document.createElement("a"), { href: url, download: name }).click();
      URL.revokeObjectURL(url);
      toast("Capture downloaded. Keep this file.", "ok", { id });
    } catch (err) {
      toast(apiError(err, "Capture failed"), "bad", { id });
    } finally {
      setBusy("");
    }
  }

  const score = data ? data.items.filter(i => i.status === "ok").length : 0;
  return (
    <div className="grid gap-4">
      <Card title="Device readiness" action={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={busy === "refresh" || !!watch} disabled={!!busy || !!watch} onClick={fullRefresh}>
            {watch ? "Fetching…" : "1. Fetch everything"}
          </Button>
          <Button variant="secondary" loading={busy === "recheck"} disabled={!!busy} onClick={recheck}>2. Re-check</Button>
          <Button loading={busy === "capture"} disabled={!!busy} onClick={capture}>3. Download capture</Button>
        </div>
      }>
        <p className="mb-4 text-sm text-ink-2">Shows which features work on this model. With a new device: fetch everything, re-check, then download the capture file so paths can be mapped later without the device.</p>
        {watch && <WatchBanner data={data} watch={watch} />}
        {!data && (
          <div className="grid gap-2">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-10 animate-pulse rounded-control bg-canvas" />)}
          </div>
        )}
        {data && (
          <>
            <p className="mb-3 text-sm font-semibold text-plum">
              {score} / {data.items.length} checks passing · {data.leafCount} parameters · {data.valuedPct}% values · vendor extensions: {data.vendorExtensions.join(", ") || "none"}
            </p>
            <Table head={["", "Feature", "Result", "Path"]}>
              {data.items.map(i => (
                <Row key={i.feature} className={changed.has(i.feature) ? "animate-flash" : ""}>
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
