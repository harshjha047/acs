const os = require("node:os");
const fs = require("node:fs/promises");
const path = require("node:path");
const axios = require("axios");
const mongoose = require("mongoose");
const monitor = require("./monitor");

const H = 3600 * 1000;
const RANK = { ok: 0, warn: 1, bad: 2 };
const check = (status, detail, extra = {}) => ({ status, detail, ...extra });
const CORE = ["database", "nbi", "cwmp", "fileServer", "monitor"];
const overall = checks => {
  const all = worst(Object.values(checks));
  return all === "bad" && !CORE.some(k => checks[k]?.status === "bad") ? "warn" : all;
};
const worst = list => list.reduce((w, c) => (RANK[c.status] > RANK[w] ? c.status : w), "ok");

function gradeMonitor(st, intervalSec, now = Date.now(), processUptimeSec = process.uptime()) {
  if (!st.lastRunAt) return processUptimeSec > intervalSec * 3 ? check("bad", "Monitor has not completed a run") : check("warn", "Waiting for first run");
  const age = (now - new Date(st.lastRunAt)) / 1000;
  if (age > intervalSec * 5) return check("bad", `Last run ${Math.round(age)}s ago`);
  if (st.error) return check("warn", st.error);
  return check(age > intervalSec * 2 ? "warn" : "ok", `${st.devices} devices in ${st.durationMs} ms, ${Math.round(age)}s ago`);
}

function gradeBackup(latest, now = Date.now()) {
  if (latest === undefined) return check("warn", "Backup folder not mounted");
  if (!latest) return check("bad", "No backups found");
  const ageH = (now - latest.mtime) / H;
  return check(ageH > 50 ? "bad" : ageH > 26 ? "warn" : "ok", `${latest.name}, ${ageH.toFixed(1)} h old, ${(latest.size / 1e6).toFixed(1)} MB`);
}

const gradeDisk = freePct => check(freePct < 5 ? "bad" : freePct < 15 ? "warn" : "ok", `${freePct.toFixed(1)}% free`);
const gradeMemory = usedPct => check(usedPct > 95 ? "bad" : usedPct > 85 ? "warn" : "ok", `${usedPct.toFixed(0)}% used`);

async function timed(fn) {
  const t = Date.now();
  try {
    return { value: await fn(), ms: Date.now() - t };
  } catch (error) {
    return { error, ms: Date.now() - t };
  }
}

const reachable = async (name, url) => {
  const r = await timed(() => axios.get(url, { timeout: 3000, validateStatus: () => true }));
  return r.error ? check("bad", `${name} unreachable: ${r.error.code || r.error.message}`) : check("ok", `HTTP ${r.value.status} in ${r.ms} ms`);
};

async function latestBackup(dir) {
  let names;
  try {
    names = (await fs.readdir(dir)).filter(n => /^mongo-.*\.archive\.gz$/.test(n));
  } catch {
    return undefined;
  }
  const stats = await Promise.all(names.map(async name => ({ name, ...(await fs.stat(path.join(dir, name))) })));
  return stats.sort((a, b) => b.mtimeMs - a.mtimeMs)[0] || null;
}

async function report() {
  const nbiUrl = process.env.GENIEACS_NBI_URL;
  const nbiGet = p => axios.get(`${nbiUrl}${p}`, { timeout: 5000 }).then(r => r.data);
  const interval = Number(process.env.MONITOR_INTERVAL_SEC) || 60;

  const [mongo, nbi, faults, tasks, cwmp, fsrv, backup, disk] = await Promise.all([
    timed(() => mongoose.connection.db.admin().ping()),
    timed(() => nbiGet("/presets?projection=_id")),
    timed(() => nbiGet("/faults?projection=_id")),
    timed(() => nbiGet("/tasks?projection=_id")),
    reachable("CWMP", process.env.CWMP_INTERNAL_URL || "http://genieacs-cwmp:7547/"),
    reachable("File server", process.env.FS_INTERNAL_URL || "http://genieacs-fs:7567/"),
    latestBackup(process.env.BACKUP_DIR || "/backups"),
    fs.statfs("/").catch(() => null)
  ]);

  const usedMem = (1 - os.freemem() / os.totalmem()) * 100;
  const checks = {
    database: mongo.error ? check("bad", mongo.error.message) : check(mongo.ms > 500 ? "warn" : "ok", `ping ${mongo.ms} ms`),
    nbi: nbi.error ? check("bad", `NBI unreachable: ${nbi.error.code || nbi.error.message}`) : check(nbi.ms > 2000 ? "warn" : "ok", `${nbi.ms} ms`),
    cwmp,
    fileServer: fsrv,
    monitor: gradeMonitor(monitor.status, interval),
    faults: faults.error ? check("warn", "Unknown") : check(faults.value.length > 50 ? "warn" : "ok", `${faults.value.length} open`, { count: faults.value.length }),
    taskQueue: tasks.error ? check("warn", "Unknown") : check(tasks.value.length > 500 ? "warn" : "ok", `${tasks.value.length} queued`, { count: tasks.value.length }),
    backup: gradeBackup(backup && { name: backup.name, mtime: backup.mtimeMs, size: backup.size }),
    disk: disk ? gradeDisk((disk.bavail / disk.blocks) * 100) : check("warn", "Unknown"),
    memory: gradeMemory(usedMem)
  };
  return {
    status: overall(checks),
    checkedAt: new Date(),
    checks,
    host: { load: os.loadavg().map(n => Math.round(n * 100) / 100), cpus: os.cpus().length, memTotalMb: Math.round(os.totalmem() / 1048576), apiUptimeSec: Math.round(process.uptime()) },
    monitor: monitor.status
  };
}

module.exports = { report, gradeMonitor, gradeBackup, gradeDisk, gradeMemory, worst, overall };
