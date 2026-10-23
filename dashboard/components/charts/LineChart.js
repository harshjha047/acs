import { useMemo, useState } from "react";

const W = 600;
const H = 140;
const COLORS = ["var(--color-magenta)", "var(--color-plum)", "var(--color-amber)"];

export default function LineChart({ points, series, unit = "", markers = [], band, fmt = v => v, height = H, minSpan = 1 }) {
  const [hover, setHover] = useState(null);
  const { x, y, min, max, t0, t1 } = useMemo(() => {
    const vals = points.flatMap(p => series.map(s => p[s.key])).filter(v => v !== null && v !== undefined);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (!vals.length) { lo = 0; hi = 1; }
    const floor = lo >= 0 ? 0 : -Infinity;
    if (hi - lo < minSpan) { const mid = (hi + lo) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
    const pad = (hi - lo) * 0.1;
    const t0 = points.length ? new Date(points[0].at).getTime() : 0;
    const t1 = points.length ? new Date(points.at(-1).at).getTime() : 1;
    return {
      min: Math.max(floor, lo - pad), max: hi + pad, t0, t1,
      x: at => ((new Date(at).getTime() - t0) / Math.max(1, t1 - t0)) * W,
      y: v => height - ((v - Math.max(floor, lo - pad)) / (hi + pad - Math.max(floor, lo - pad))) * height
    };
  }, [points, series, height, minSpan]);

  if (!points.length) return <p className="py-6 text-sm text-ink-2">No data yet.</p>;

  const path = key => points.reduce((d, p) => {
    const v = p[key];
    if (v === null || v === undefined) return d + " ";
    const cmd = d.endsWith(" ") || !d ? "M" : "L";
    return `${d}${cmd}${x(p.at).toFixed(1)},${y(v).toFixed(1)}`;
  }, "").replace(/ +/g, " ").trim();

  function move(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const t = t0 + ((e.clientX - r.left) / r.width) * (t1 - t0);
    let best = 0;
    points.forEach((p, i) => { if (Math.abs(new Date(p.at) - t) < Math.abs(new Date(points[best].at) - t)) best = i; });
    setHover(best);
  }

  const hp = hover !== null ? points[hover] : null;
  return (
    <div className="relative">
      <div className="mb-1 flex justify-between font-mono text-[11px] text-ink-3">
        <span>{fmt(Math.round(max * 10) / 10)} {unit}</span>
        <span className="flex gap-3">{series.map((s, i) => <span key={s.key} style={{ color: s.color || COLORS[i] }}>● {s.label}</span>)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="h-36 w-full cursor-crosshair rounded-control bg-canvas" onMouseMove={move} onMouseLeave={() => setHover(null)}>
        {band && <rect x="0" width={W} y={y(band[1])} height={Math.max(0, y(band[0]) - y(band[1]))} fill="var(--color-ok-bg)" />}
        {markers.map((m, i) => <line key={i} x1={x(m.at)} x2={x(m.at)} y1="0" y2={height} stroke={m.color || "var(--color-bad)"} strokeDasharray="3 3" vectorEffect="non-scaling-stroke"><title>{m.label}</title></line>)}
        {series.map((s, i) => <path key={s.key} d={path(s.key)} fill="none" stroke={s.color || COLORS[i]} strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
        {points.length <= 60 && series.map((s, i) => points.map((p, j) => (p[s.key] === null || p[s.key] === undefined ? null : (
          <circle key={`${s.key}${j}`} cx={points.length === 1 ? W / 2 : x(p.at)} cy={y(p[s.key])} r="3" fill={s.color || COLORS[i]} />
        ))))}
        {hp && <line x1={x(hp.at)} x2={x(hp.at)} y1="0" y2={height} stroke="var(--color-ink-3)" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-ink-3">
        <span>{fmt(Math.round(min * 10) / 10)} {unit}</span>
        <span>{hp ? `${new Date(hp.at).toLocaleString()} · ${series.map(s => `${s.label} ${hp[s.key] ?? "—"}`).join(" · ")}` : `${new Date(t0).toLocaleString()} → ${new Date(t1).toLocaleString()}`}</span>
      </div>
    </div>
  );
}
