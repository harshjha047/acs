import { useCallback, useEffect, useState } from "react";
import api from "../../lib/api";
import usePoll from "../../lib/usePoll";
import { apiError, errTone, when } from "../../lib/format";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Field from "../ui/Field";
import { useToast } from "../ui/Toast";

const finished = r => r && (r.fault || (!r.stale && (r.state === "complete" || r.state === "error")));
const input = "h-11 rounded-control border border-line bg-white px-4 text-sm outline-none focus:border-plum";

function Status({ poll, queued, label }) {
  const r = poll.data;
  const pre = label ? `${label}: ` : "";
  if (r?.fault) return <p className="text-sm text-bad">{pre}Device rejected the test: {r.fault.detail || r.fault.message} ({r.fault.code})</p>;
  if (r?.state === "error" && !r.stale) return <p className="text-sm text-bad">{pre}Test failed on device: {r.rawState}</p>;
  if (poll.polling) return <p className="text-sm text-ink-2">{pre}{queued ? "Queued; runs at the device's next check-in (up to 5 min)..." : "Running on the device..."}</p>;
  if (r && !finished(r) && r.requestedAt) return <p className="text-sm text-warn">{pre}No result yet. The device may run it on its next check-in; try “Check result” later.</p>;
  return null;
}

function useDiagnostic(deviceId, kind) {
  const toast = useToast();
  const [queued, setQueued] = useState(false);
  const [checking, setChecking] = useState(false);
  const fetcher = useCallback(() => api.get(`/devices/${deviceId}/diagnostics/${kind}`).then(r => r.data), [deviceId, kind]);
  const poll = usePoll(fetcher, { interval: 5000, maxMs: 420000, done: finished });

  async function run(body) {
    try {
      poll.setData(null);
      const { status } = await api.post(`/devices/${deviceId}/diagnostics/${kind}`, body);
      setQueued(status === 202);
      toast(status === 202 ? "Test queued; runs at the device's next check-in." : "Test started on the device.", status === 202 ? "warn" : "ok");
      poll.start();
    } catch (err) {
      toast(apiError(err, "Could not start test"), errTone(err));
    }
  }
  async function check(quiet = false) {
    setChecking(true);
    try {
      const r = (await api.get(`/devices/${deviceId}/diagnostics/${kind}?live=1`)).data;
      poll.setData(r);
      if (!finished(r) && !quiet) toast("No result yet.", "warn", { duration: 2500 });
      return finished(r);
    } catch (err) {
      toast(apiError(err, "Check failed"), "bad");
    } finally {
      setChecking(false);
    }
  }
  return { poll, queued, checking, run, check };
}

function Unsupported({ cap }) {
  return cap && !cap.supported ? <p className="mb-3 text-sm text-warn">Not available on this device: {cap.detail}</p> : null;
}

function Transfer({ r, label }) {
  if (r?.state !== "complete" || r.stale) return null;
  return (
    <dl className="mt-4 grid grid-cols-3 gap-4">
      <Field label={label}><span className="text-2xl font-extrabold">{r.mbps ?? "?"} Mbps</span></Field>
      <Field label="Data" value={r.bytes ? `${(r.bytes / 1e6).toFixed(1)} MB` : null} />
      <Field label="Duration" value={r.seconds ? `${r.seconds}s` : null} />
    </dl>
  );
}

const hopTone = h => (h.error || !h.rtts.length ? "bad" : h.avgMs > 150 ? "warn" : "ok");

export default function ToolsPanel({ deviceId }) {
  const toast = useToast();
  const [caps, setCaps] = useState(null);
  const [host, setHost] = useState("8.8.8.8");
  const [count, setCount] = useState(4);
  const [traceHost, setTraceHost] = useState("8.8.8.8");
  const [maxHops, setMaxHops] = useState(20);
  const ping = useDiagnostic(deviceId, "ping");
  const trace = useDiagnostic(deviceId, "traceroute");
  const speed = useDiagnostic(deviceId, "speed");
  const upload = useDiagnostic(deviceId, "upload");
  const p = ping.poll.data, t = trace.poll.data;
  const busy = [ping, trace, speed, upload].some(d => d.poll.polling);
  const off = key => !!caps?.[key] && !caps[key].supported;

  useEffect(() => {
    api.get(`/devices/${deviceId}/capabilities`).then(r => setCaps(r.data)).catch(() => setCaps({}));
  }, [deviceId]);

  return (
    <div className="grid gap-4">
      {caps?.instantActions && !caps.instantActions.supported && (
        <p className="rounded-card border border-line bg-white px-5 py-3 text-sm text-ink-2">
          <Badge tone="warn">Queued mode</Badge> <span className="ml-2">{caps.instantActions.detail}. One test at a time; each runs within one inform interval.</span>
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Ping from the router">
          <p className="mb-4 text-sm text-ink-2">Tests the line from the customer’s router. Loss or high latency here means the problem is on the network side, not their phone/PC.</p>
          <Unsupported cap={caps?.ping} />
          <div className="flex flex-wrap gap-2">
            <input className={`${input} flex-1`} value={host} onChange={e => setHost(e.target.value)} placeholder="Host or IP" />
            <input className={`${input} w-20`} type="number" min={1} max={10} value={count} onChange={e => setCount(e.target.value)} />
            <Button loading={ping.poll.polling} disabled={off("ping") || (busy && !ping.poll.polling)} onClick={() => ping.run({ host, count })}>{ping.poll.polling ? "Running…" : "Run ping"}</Button>
            <Button variant="secondary" loading={ping.checking} onClick={ping.check}>Check result</Button>
          </div>
          <div className="mt-4"><Status poll={ping.poll} queued={ping.queued} /></div>
          {p?.state === "complete" && !p.stale && (
            <dl className="mt-4 grid grid-cols-3 gap-4">
              <Field label="Received">{`${p.received ?? "?"} / ${p.sent ?? "?"}`}</Field>
              <Field label="Loss"><Badge tone={p.lossPct === 0 ? "ok" : p.lossPct < 20 ? "warn" : "bad"}>{p.lossPct}%</Badge></Field>
              <Field label="Avg / min / max">{`${p.avgMs ?? "?"} / ${p.minMs ?? "?"} / ${p.maxMs ?? "?"} ms`}</Field>
              <Field label="Host" value={p.host} />
              <Field label="Checked" value={when(p.checkedAt)} />
            </dl>
          )}
        </Card>

        <Card title="Speed test from the router">
          <p className="mb-4 text-sm text-ink-2">Transfers a test file between the router and our server (TR-143). Result is capped by the server’s bandwidth; use it to spot clearly low speeds.</p>
          <Unsupported cap={off("download") ? caps.download : off("upload") ? caps.upload : null} />
          <div className="flex flex-wrap gap-2">
            <Button loading={speed.poll.polling} disabled={off("download") || (busy && !speed.poll.polling)} onClick={() => speed.run()}>{speed.poll.polling ? "Testing…" : "Download test"}</Button>
            <Button loading={upload.poll.polling} disabled={off("upload") || (busy && !upload.poll.polling)} onClick={() => upload.run()}>{upload.poll.polling ? "Testing…" : "Upload test"}</Button>
            <Button variant="secondary" loading={speed.checking || upload.checking} onClick={async () => { if (!(await Promise.all([speed.check(true), upload.check(true)])).some(Boolean)) toast("No result yet.", "warn", { duration: 2500 }); }}>Check results</Button>
          </div>
          <div className="mt-4 grid gap-1"><Status poll={speed.poll} queued={speed.queued} label="Download" /><Status poll={upload.poll} queued={upload.queued} label="Upload" /></div>
          <Transfer r={speed.poll.data} label="Download" />
          <Transfer r={upload.poll.data} label="Upload" />
        </Card>
      </div>

      <Card title="Traceroute from the router">
        <p className="mb-4 text-sm text-ink-2">Shows each network hop from the router to a host. The first hop that times out or jumps in latency is usually where the problem is.</p>
        <Unsupported cap={caps?.traceroute} />
        <div className="flex flex-wrap gap-2">
          <input className={`${input} flex-1`} value={traceHost} onChange={e => setTraceHost(e.target.value)} placeholder="Host or IP" />
          <input className={`${input} w-20`} type="number" min={1} max={30} value={maxHops} onChange={e => setMaxHops(e.target.value)} title="Max hops" />
          <Button loading={trace.poll.polling} disabled={off("traceroute") || (busy && !trace.poll.polling)} onClick={() => trace.run({ host: traceHost, maxHops })}>{trace.poll.polling ? "Tracing…" : "Run traceroute"}</Button>
          <Button variant="secondary" loading={trace.checking} onClick={trace.check}>Check result</Button>
        </div>
        <div className="mt-4"><Status poll={trace.poll} queued={trace.queued} /></div>
        {t?.hops?.length > 0 && !t.stale && (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-widest text-ink-3">
                <th className="py-2">Hop</th><th>Host</th><th>Address</th><th>Avg</th><th>Samples (ms)</th>
              </tr>
            </thead>
            <tbody>
              {t.hops.map(h => (
                <tr key={h.hop} className="border-b border-line/60">
                  <td className="py-2 font-mono">{h.hop}</td>
                  <td className="font-mono">{h.host || "*"}</td>
                  <td className="font-mono">{h.address || "—"}</td>
                  <td><Badge tone={hopTone(h)}>{h.avgMs !== null ? `${h.avgMs} ms` : h.error ? `err ${h.error}` : "timeout"}</Badge></td>
                  <td className="font-mono text-ink-2">{h.rtts.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
