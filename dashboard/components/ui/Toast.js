import { createContext, useCallback, useContext, useState } from "react";

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

const tones = { ok: "border-ok", bad: "border-bad", muted: "border-muted" };

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const push = useCallback((message, tone = "muted") => {
    const id = crypto.randomUUID();
    setItems(i => [...i, { id, message, tone }]);
    setTimeout(() => setItems(i => i.filter(t => t.id !== id)), 4000);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {items.map(t => (
          <div key={t.id} className={`rounded-control border-l-4 bg-white px-4 py-3 text-sm shadow-lg ${tones[t.tone]}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
