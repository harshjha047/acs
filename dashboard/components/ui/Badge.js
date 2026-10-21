const tones = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
  muted: "bg-muted-bg text-muted"
};

export default function Badge({ tone = "muted", children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-chip px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
