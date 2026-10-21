export default function Field({ label, value, mono = false, children }) {
  return (
    <div className="min-w-0">
      <dt className="truncate font-mono text-[11px] uppercase tracking-widest text-ink-3" title={label}>{label}</dt>
      <dd className={`mt-1 break-words text-sm font-semibold text-plum ${mono ? "font-mono" : ""}`}>
        {children ?? (value === null || value === undefined || value === "" ? "—" : String(value))}
      </dd>
    </div>
  );
}
