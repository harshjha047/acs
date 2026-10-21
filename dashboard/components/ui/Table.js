export function Table({ head, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-widest text-ink-3">
            {head.map((h, i) => <th key={i} className="py-2 pr-4 font-normal">{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const Row = ({ children, className = "" }) => <tr className={`border-b border-line/60 align-top ${className}`}>{children}</tr>;
export const Cell = ({ children, mono = false, className = "" }) => <td className={`py-2.5 pr-4 ${mono ? "font-mono text-xs" : ""} ${className}`}>{children ?? "—"}</td>;
