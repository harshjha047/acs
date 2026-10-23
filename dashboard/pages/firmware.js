import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import api from "../lib/api";
import { apiError, errTone, input, when, FW_TONE, FW_LABEL, ROLLOUT_TONE } from "../lib/format";
import Shell from "../components/Shell";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import { Table, Row, Cell } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";
import useAction from "../lib/useAction";

const REL_TONE = { draft: "muted", approved: "ok", retired: "muted" };
const mb = n => (n ? `${(n / 1048576).toFixed(1)} MB` : "—");
const EMPTY_UP = { file: null, manufacturer: "", productClass: "", version: "", hardwareVersions: "", fromVersions: "", releaseNotes: "" };
const EMPTY_RO = { releaseId: "", tags: "canary", fromVersions: "", waves: "5,50,500,0", maxFailPct: 5, start: "01:00", end: "05:00", reason: "" };

async function sha256(file) {
  const buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function Progress({ jobs = {} }) {
  const parts = [["applied", "bg-ok"], ["failed", "bg-bad"], ["downloading", "bg-warn"], ["rebooting", "bg-warn"], ["sent", "bg-warn/50"], ["skipped", "bg-line"]];
  const total = parts.reduce((n, [k]) => n + (jobs[k] || 0), 0);
  if (!total) return <span className="text-xs text-ink-3">no devices yet</span>;
  return (
    <div className="grid gap-1">
      <div className="flex h-2 w-40 overflow-hidden rounded-full bg-canvas">
        {parts.map(([k, c]) => jobs[k] ? <span key={k} className={c} style={{ width: `${(jobs[k] * 100) / total}%` }} /> : null)}
      </div>
      <span className="text-xs text-ink-2">{jobs.applied || 0} ok · {jobs.failed || 0} failed · {(jobs.sent || 0) + (jobs.downloading || 0) + (jobs.rebooting || 0)} running{jobs.skipped ? ` · ${jobs.skipped} skipped` : ""}</span>
    </div>
  );
}

export default function Firmware() {
  const toast = useToast();
  const [role, setRole] = useState(null);
  const [releases, setReleases] = useState([]);
  const [rollouts, setRollouts] = useState([]);
  const [up, setUp] = useState(null);
  const [progress, setProgress] = useState(null);
  const [ro, setRo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [detail, setDetail] = useState(null);
  const [halt, setHalt] = useState(null);
  const [busy, run] = useAction();
  const isAdmin = role === "admin";

  const load = useCallback(() => Promise.all([
    api.get("/firmware/releases").then(({ data }) => setReleases(data)),
    api.get("/firmware/rollouts").then(({ data }) => setRollouts(data))
  ]).catch(err => toast(apiError(err, "Failed to load"), "bad")), [toast]);

  useEffect(() => {
    setRole(JSON.parse(localStorage.getItem("user") || "null")?.role);
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    setPreview(null);
    if (!ro?.releaseId) return;
    const t = setTimeout(() => api.post("/firmware/rollouts/preview", ro).then(({ data }) => setPreview(data)).catch(err => setPreview({ error: apiError(err, "Preview failed") })), 300);
    return () => clearTimeout(t);
  }, [ro]);

  const upload = () => run(async () => {
    try {
      setProgress("Hashing…");
      const hash = await sha256(up.file);
      const params = { ...up, file: undefined, fileName: up.file.name.replace(/[^A-Za-z0-9._-]/g, "_"), sha256: hash };
      await api.put("/firmware/releases/upload", up.file, {
        params, headers: { "Content-Type": "application/octet-stream" }, timeout: 0,
        onUploadProgress: e => setProgress(`Uploading ${Math.round((e.loaded * 100) / (e.total || up.file.size))}%`)
      });
      toast("Release uploaded as draft. Push it to a bench device next.", "ok");
      setUp(null);
      load();
    } catch (err) {
      toast(apiError(err, "Upload failed"), "bad");
    } finally {
      setProgress(null);
    }
  });

  const patchRelease = (r, body, msg) => run(async () => {
    try {
      await api.patch(`/firmware/releases/${r._id}`, body);
      toast(msg, "ok");
      load();
    } catch (err) {
      toast(apiError(err, "Failed"), errTone(err));
    }
  });

  const deleteRelease = r => run(async () => {
    try {
      await api.delete(`/firmware/releases/${r._id}`);
      toast("Release deleted", "ok");
      load();
    } catch (err) {
      toast(apiError(err, "Delete failed"), errTone(err));
    }
  });

  const createRollout = () => run(async () => {
    try {
      await api.post("/firmware/rollouts", { ...ro, window: { start: ro.start, end: ro.end } });
      toast("Rollout created as draft. Start it when ready.", "ok");
      setRo(null);
      load();
    } catch (err) {
      toast(apiError(err, "Create failed"), errTone(err));
    }
  });

  const op = (r, name, note) => run(async () => {
    try {
      await api.post(`/firmware/rollouts/${r._id}/${name}`, { note });
      toast(`Rollout ${name === "halt" ? "halted" : name + "d"}`, name === "halt" ? "warn" : "ok");
      setHalt(null);
      load();
      if (detail?._id === r._id) openDetail(r);
    } catch (err) {
      toast(apiError(err, "Failed"), errTone(err));
    }
  });

  const openDetail = r => api.get(`/firmware/rollouts/${r._id}`).then(({ data }) => setDetail(data)).catch(err => toast(apiError(err, "Failed"), "bad"));

  const setU = k => e => setUp({ ...up, [k]: k === "file" ? e.target.files[0] : e.target.value });
  const setR = k => e => setRo({ ...ro, [k]: e.target.value });

  return (
    <Shell title="Firmware">
      <div className="grid gap-4">
        <Card title="Releases" action={isAdmin && <Button onClick={() => setUp(EMPTY_UP)}>Upload release</Button>}>
          <p className="mb-3 text-xs text-ink-2">Flow: upload (draft) → push to a bench device from its page → approve after it shows Applied → create a rollout.</p>
          <Table head={["Model", "Version", "File", "Status", "Devices", ""]}>
            {releases.map(r => (
              <Row key={r._id}>
                <Cell>{r.manufacturer} {r.productClass}{r.hardwareVersions?.length ? <div className="text-xs text-ink-3">HW {r.hardwareVersions.join(", ")}</div> : null}</Cell>
                <Cell mono>{r.version}{r.fromVersions?.length ? <div className="text-ink-3">from {r.fromVersions.join(", ")}</div> : null}</Cell>
                <Cell mono>{r.fileName}<div className="text-ink-3" title={r.sha256}>{mb(r.fileSize)} · {r.sha256.slice(0, 12)}…</div></Cell>
                <Cell><Badge tone={REL_TONE[r.status]}>{r.status}</Badge>{r.approvedBy && <div className="mt-1 text-xs text-ink-3">by {r.approvedBy.name}</div>}</Cell>
                <Cell><Progress jobs={r.jobs} /></Cell>
                <Cell>
                  {isAdmin && (
                    <div className="flex flex-wrap gap-2">
                      {r.status === "draft" && <Button variant="secondary" className="min-h-9 px-3" disabled={busy} onClick={() => patchRelease(r, { status: "approved" }, "Approved")}>Approve</Button>}
                      {r.status !== "retired" && <Button variant="secondary" className="min-h-9 px-3" disabled={busy} onClick={() => patchRelease(r, { status: "retired" }, "Retired")}>Retire</Button>}
                      {!Object.keys(r.jobs || {}).length && <Button variant="secondary" className="min-h-9 px-3" disabled={busy} onClick={() => deleteRelease(r)}>Delete</Button>}
                    </div>
                  )}
                </Cell>
              </Row>
            ))}
          </Table>
          {!releases.length && <p className="py-4 text-sm text-ink-3">No releases yet.</p>}
        </Card>

        <Card title="Rollouts" action={isAdmin && <Button disabled={!releases.some(r => r.status === "approved")} onClick={() => setRo(EMPTY_RO)}>New rollout</Button>}>
          <Table head={["Release", "Target", "Wave", "Progress", "Status", ""]}>
            {rollouts.map(r => (
              <Row key={r._id}>
                <Cell>{r.release?.productClass} <span className="font-mono text-xs">{r.release?.version}</span><div className="text-xs text-ink-3">{when(r.createdAt)} · {r.createdBy?.name}</div></Cell>
                <Cell className="text-xs">{r.target?.tags?.length ? `tags: ${r.target.tags.join(", ")}` : "all"}{r.target?.fromVersions?.length ? ` · from ${r.target.fromVersions.join(", ")}` : ""}<div className="text-ink-3">{r.window.start}–{r.window.end} IST{r.status === "running" && !r.inWindow ? " · outside window" : ""}</div></Cell>
                <Cell className="text-xs">{r.currentWave + 1}/{r.waves.length} <span className="text-ink-3">({r.waves.map(w => w || "rest").join(" → ")})</span></Cell>
                <Cell><Progress jobs={r.jobs} /></Cell>
                <Cell><Badge tone={ROLLOUT_TONE[r.status]}>{r.status}</Badge><div className="mt-1 max-w-xs text-xs text-ink-3">{r.history?.at(-1)?.note}</div></Cell>
                <Cell>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" className="min-h-9 px-3" onClick={() => openDetail(r)}>Details</Button>
                    {isAdmin && r.status === "draft" && <Button className="min-h-9 px-3" disabled={busy} onClick={() => op(r, "start")}>Start</Button>}
                    {isAdmin && r.status === "running" && <Button variant="secondary" className="min-h-9 px-3" disabled={busy} onClick={() => op(r, "pause")}>Pause</Button>}
                    {isAdmin && r.status === "paused" && <Button variant="secondary" className="min-h-9 px-3" disabled={busy} onClick={() => op(r, "resume")}>Resume</Button>}
                    {isAdmin && r.status === "paused" && r.currentWave < r.waves.length - 1 && <Button className="min-h-9 px-3" disabled={busy} onClick={() => op(r, "promote")}>Promote to wave {r.currentWave + 2}</Button>}
                    {isAdmin && ["draft", "running", "paused"].includes(r.status) && <Button variant="danger" className="min-h-9 px-3" disabled={busy} onClick={() => setHalt({ r, note: "" })}>Halt</Button>}
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
          {!rollouts.length && <p className="py-4 text-sm text-ink-3">No rollouts yet.</p>}
        </Card>
      </div>

      <Modal open={!!up} onClose={() => !busy && setUp(null)} title="Upload firmware release" size="max-w-lg"
        footer={<>
          <Button variant="secondary" disabled={busy} onClick={() => setUp(null)}>Cancel</Button>
          <Button disabled={!up?.file || !up?.manufacturer || !up?.productClass || !up?.version} loading={busy} onClick={upload}>{progress || "Upload"}</Button>
        </>}>
        {up && (
          <div className="grid gap-3">
            <input type="file" className="text-sm" onChange={setU("file")} />
            <div className="grid grid-cols-2 gap-2">
              <input className={input} placeholder="Manufacturer (as on device)" value={up.manufacturer} onChange={setU("manufacturer")} />
              <input className={input} placeholder="Product class" value={up.productClass} onChange={setU("productClass")} />
            </div>
            <input className={`${input} font-mono`} placeholder="Target version (exact SoftwareVersion after upgrade)" value={up.version} onChange={setU("version")} />
            <input className={input} placeholder="Hardware versions (comma, optional)" value={up.hardwareVersions} onChange={setU("hardwareVersions")} />
            <input className={input} placeholder="Allowed from-versions (comma, optional)" value={up.fromVersions} onChange={setU("fromVersions")} />
            <textarea className={`${input} h-20 py-2`} placeholder="Release notes" value={up.releaseNotes} onChange={setU("releaseNotes")} />
            <p className="text-xs text-ink-3">The target version must match what the device reports after upgrading; that is how success is detected.</p>
          </div>
        )}
      </Modal>

      <Modal open={!!ro} onClose={() => setRo(null)} title="New rollout" size="max-w-lg"
        footer={<>
          <Button variant="secondary" onClick={() => setRo(null)}>Cancel</Button>
          <Button disabled={!ro?.releaseId || !ro?.reason.trim() || !preview?.eligible} loading={busy} onClick={createRollout}>Create draft</Button>
        </>}>
        {ro && (
          <div className="grid gap-3">
            <select className={input} value={ro.releaseId} onChange={setR("releaseId")}>
              <option value="">Pick an approved release</option>
              {releases.filter(r => r.status === "approved").map(r => <option key={r._id} value={r._id}>{r.manufacturer} {r.productClass} {r.version}</option>)}
            </select>
            <input className={input} placeholder="Device tags (all required, comma). Empty = whole model" value={ro.tags} onChange={setR("tags")} />
            <input className={input} placeholder="From-versions (comma, optional)" value={ro.fromVersions} onChange={setR("fromVersions")} />
            <div className="grid grid-cols-2 gap-2">
              <input className={input} placeholder="Waves e.g. 5,50,500,0" value={ro.waves} onChange={setR("waves")} />
              <input className={input} type="number" min="0" max="100" placeholder="Halt above fail %" value={ro.maxFailPct} onChange={setR("maxFailPct")} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className={input} type="time" value={ro.start} onChange={setR("start")} />
              <input className={input} type="time" value={ro.end} onChange={setR("end")} />
            </div>
            <input className={input} placeholder="Reason (required)" value={ro.reason} onChange={setR("reason")} />
            {preview?.error && <p className="text-xs font-semibold text-bad">{preview.error}</p>}
            {preview && !preview.error && (
              <div className="rounded-control bg-canvas p-3 text-xs">
                <b>{preview.eligible}</b> eligible, {preview.online} online now.
                {!preview.profileEnabled && <p className="font-semibold text-bad">Firmware upgrade is not enabled in this model&apos;s profile (setProfile --firmware on).</p>}
                {preview.sample?.length > 0 && <p className="mt-1 font-mono text-ink-2">{preview.sample.map(d => d.serialNumber).join(", ")}</p>}
                <p className="mt-1 text-ink-3">Each wave pauses when done. Promote after checking the devices. Halts automatically above the fail %.</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={!!halt} onClose={() => setHalt(null)} title="Halt rollout"
        footer={<>
          <Button variant="secondary" onClick={() => setHalt(null)}>Cancel</Button>
          <Button variant="danger" disabled={!halt?.note.trim()} loading={busy} onClick={() => op(halt.r, "halt", halt.note)}>Halt</Button>
        </>}>
        <p className="mb-3 text-xs text-ink-2">Stops new devices and cancels downloads not yet picked up. Devices already downloading continue.</p>
        <input className={input} placeholder="Reason (required)" value={halt?.note || ""} onChange={e => setHalt({ ...halt, note: e.target.value })} />
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Rollout ${detail?.release?.version || ""}`} size="max-w-4xl">
        {detail && (
          <div className="grid max-h-[70vh] gap-4 overflow-y-auto">
            <ul className="grid gap-1 text-xs text-ink-2">
              {detail.history.map((h, i) => <li key={i}><b>{h.op}</b> · {when(h.at)}{h.by?.name ? ` · ${h.by.name}` : ""}{h.note ? ` · ${h.note}` : ""}</li>)}
            </ul>
            <Table head={["Wave", "Device", "Customer", "From → to", "State", "Updated"]}>
              {detail.jobsList.map(j => (
                <Row key={j._id}>
                  <Cell>{j.wave + 1}</Cell>
                  <Cell mono>{j.device ? <Link className="underline" href={`/devices/${j.device._id}`}>{j.device.serialNumber}</Link> : "—"}</Cell>
                  <Cell>{j.device?.customer?.name}</Cell>
                  <Cell mono>{j.fromVersion || "?"} → {j.toVersion || "?"}</Cell>
                  <Cell><Badge tone={FW_TONE[j.state]}>{FW_LABEL[j.state]}</Badge>{j.error && <div className="mt-1 text-xs text-bad">{j.error}</div>}</Cell>
                  <Cell className="text-xs">{when(j.finishedAt || j.updatedAt)}</Cell>
                </Row>
              ))}
            </Table>
            {!detail.jobsList.length && <p className="text-sm text-ink-3">No devices picked yet{detail.status === "running" ? " (waits for the window and online devices)" : ""}.</p>}
          </div>
        )}
      </Modal>
    </Shell>
  );
}
