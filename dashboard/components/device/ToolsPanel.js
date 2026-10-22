import { useCallback, useState } from "react";
import api from "../../lib/api";
import usePoll from "../../lib/usePoll";
import { apiError, when } from "../../lib/format";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Field from "../ui/Field";
import { useToast } from "../ui/Toast";

const finished = r => r && (r.fault || (!r.stale && (r.state === "complete" || r.state === "error")));
const input = "h-11 rounded-control border border-line bg-white px-4 text-sm outline-none focus:border-plum";

function Status({ poll, queued }) {
  const r = poll.data;
  if (r?.fault) return <p className="text-sm text-bad">Device rejected the test: {r.fault.detail || r.fault.message} ({r.fault.code})</p>;
  if (r?.state === "error" && !r.stale) return <p className="text-sm text-bad">Test failed on device: {r.rawState}</p>;
  if (poll.polling) return <p className="text-sm text-ink-2">{queued ? "Queued; runs at the device's next check-in (up to 5 min)..." : "Running on the device..."}</p>;
  if (r && !finished(r)) return <p className="text-sm text-warn">No result yet. The device may run it on its next check-in; try “Check result” later.</p>;
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
      toast(apiError(err, "Could not start test"), "bad");
    }
  }
  async function check() {
    setChecking(true);
    try {
      const r = (await api.get(`/devices/${deviceId}/diagnostics/${kind}?live=1`)).data;
      poll.setData(r);
      if (!finished(r)) toast("No result yet.", "warn", { duration: 2500 });
    } catch (err) {
      toast(apiError(err, "Check failed"), "bad");
    } finally {
      setChecking(false);
    }
  }
  return { poll, queued, checking, run, check };
}

export default function ToolsPanel({ deviceId }) {
  const [host, setHost] = useState("8.8.8.8");
  const [count, setCount] = useState(4);
  const ping = useDiagnostic(deviceId, "ping");
  const speed = useDiagnostic(deviceId, "speed");
  const p = ping.poll.data, s = speed.poll.data;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Ping from the router">
        <p className="mb-4 text-sm text-ink-2">Tests the line from the customer’s router. Loss or high latency here means the problem is on the network side, not their phone/PC.</p>
        <div className="flex flex-wrap gap-2">
          <input className={`${input} flex-1`} value={host} onChange={e => setHost(e.target.value)} placeholder="Host or IP" />
          <input className={`${input} w-20`} type="number" min={1} max={10} value={count} onChange={e => setCount(e.target.value)} />
          <Button loading={ping.poll.polling} onClick={() => ping.run({ host, count })}>{ping.poll.polling ? "Running…" : "Run ping"}</Button>
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
        <p className="mb-4 text-sm text-ink-2">Downloads a test file from our server to the router (TR-143). Result is capped by the server’s bandwidth; use it to spot clearly low speeds.</p>
        <div className="flex flex-wrap gap-2">
          <Button loading={speed.poll.polling} onClick={() => speed.run()}>{speed.poll.polling ? "Testing…" : "Run download test"}</Button>
          <Button variant="secondary" loading={speed.checking} onClick={speed.check}>Check result</Button>
        </div>
        <div className="mt-4"><Status poll={speed.poll} queued={speed.queued} /></div>
        {s?.state === "complete" && !s.stale && (
          <dl className="mt-4 grid grid-cols-3 gap-4">
            <Field label="Download"><span className="text-2xl font-extrabold">{s.mbps ?? "?"} Mbps</span></Field>
            <Field label="Data" value={s.bytes ? `${(s.bytes / 1e6).toFixed(1)} MB` : null} />
            <Field label="Duration" value={s.seconds ? `${s.seconds}s` : null} />
          </dl>
        )}
      </Card>
    </div>
  );
}
