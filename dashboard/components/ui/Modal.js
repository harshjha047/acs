import { useEffect } from "react";

export default function Modal({ open, onClose, title, children, footer, size = "max-w-md" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-plum/50 p-4" onClick={onClose}>
      <div className={`w-full ${size} rounded-card bg-white p-6 shadow-xl`} onClick={e => e.stopPropagation()}>
        <h3 className="mb-2 text-lg font-bold">{title}</h3>
        <div className="text-sm text-ink">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
