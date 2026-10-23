import { useCallback, useEffect, useState } from "react";
import api from "../../lib/api";
import { apiError, when, EVENT_LABEL, describeEvent } from "../../lib/format";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { useToast } from "../ui/Toast";
import useAction from "../../lib/useAction";

const ACTION = {
  diagnostics_view: "Viewed diagnostics", reboot: "Reboot", factory_reset: "Factory reset", wifi_update: "Wi-Fi change", firmware_push: "Firmware push", device_remove: "Removed from ACS",
  auto_provision: "Auto-provision", refresh: "Refresh", ping: "Ping test", speed_test: "Speed test", capture: "Capture", customer_link: "Customer linked"
};
const RESULT = { success: "ok", failed: "bad", pending: "warn" };

function describe(e) {
  if (e.type === "note") return e.text;
  if (e.type === "system") return e.text;
  if (e.type === "event") return describeEvent(e);
  if (e.type === "fault") return `Device fault ${e.code}: ${e.detail || e.message}`;
  const d = e.details || {};
  if (e.action === "wifi_update") return (d.changes || []).map(([p, v]) => `${p.split(".").slice(-2).join(".")} → ${v}`).join(", ");
  if (e.action === "ping") return `${d.host} ×${d.count}${d.testState ? ` · ${d.testRawState || d.testState}` : ""}`;
  if (e.action === "speed_test" && d.testState) return d.testRawState || d.testState;
  if (e.action === "refresh") return d.scope;
  if (e.action === "reboot" && d.downtimeSec !== undefined) return `${d.reason} · back after ${d.downtimeSec}s`;
  if (d.reason) return d.reason;
  return e.error || "";
}

export default function TimelinePanel({ deviceId }) {
  const toast = useToast();
  const [events, setEvents] = useState(null);
  const [text, setText] = useState("");
  const [busy, run] = useAction();
  const [filter, setFilter] = useState("all");

  const load = useCallback(() => {
    api.get(`/devices/${deviceId}/timeline`).then(({ data }) => setEvents(data)).catch(err => toast(apiError(err, "Failed to load timeline"), "bad"));
  }, [deviceId, toast]);
  useEffect(load, [load]);

  function addNote(e) {
    e.preventDefault();
    if (!text.trim()) return;
    run(async () => {
      try {
        await api.post(`/devices/${deviceId}/notes`, { text });
        setText("");
        toast("Note saved.", "ok", { duration: 2500 });
        load();
      } catch (err) {
        toast(apiError(err, "Could not save note"), "bad");
      }
    });
  }

  const shown = (events || []).filter(e => filter === "all" || e.type === filter);
  return (
    <div className="grid gap-4">
      <Card title="Add note">
        <form onSubmit={addNote} className="flex flex-col gap-3">
          <textarea className="min-h-20 w-full rounded-control border border-line p-3 text-sm outline-none focus:border-plum" maxLength={2000}
            placeholder="e.g. Customer reports drops every evening; Rx was -26 dBm; advised technician visit" value={text} onChange={e => setText(e.target.value)} />
          <div><Button type="submit" loading={busy} disabled={!text.trim()}>{busy ? "Saving…" : "Save note"}</Button></div>
        </form>
      </Card>
      <Card title="History" action={
        <select className="h-9 rounded-control border border-line px-2 text-sm" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All</option><option value="note">Notes</option><option value="action">Actions</option><option value="fault">Faults</option><option value="event">Device events</option><option value="system">System</option>
        </select>
      }>
        {!events && <p className="text-sm">Loading...</p>}
        {events && shown.length === 0 && <p className="text-sm text-ink-2">Nothing yet.</p>}
        <ol className="flex flex-col">
          {shown.map((e, i) => (
            <li key={i} className="flex gap-4 border-b border-line/60 py-3 last:border-0">
              <span className="w-40 shrink-0 font-mono text-xs text-ink-3">{when(e.at)}</span>
              <div className="min-w-0 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-plum">
                    {e.type === "note" ? "Note" : e.type === "fault" ? "Fault" : e.type === "system" ? "Device" : e.type === "event" ? EVENT_LABEL[e.event] || e.event : ACTION[e.action] || e.action}
                  </span>
                  {e.result && <Badge tone={RESULT[e.result]}>{e.result}</Badge>}
                  {e.user && <span className="text-xs text-ink-2">by {e.user}</span>}
                </div>
                <p className={`mt-0.5 break-words ${e.type === "fault" ? "text-bad" : "text-ink"}`}>{describe(e)}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
