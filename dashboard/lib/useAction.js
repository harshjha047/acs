import { useCallback, useRef, useState } from "react";

export default function useAction() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async fn => {
    if (lock.current) return undefined;
    lock.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, []);
  return [busy, run];
}
