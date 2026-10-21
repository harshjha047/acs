import { useCallback, useEffect, useRef, useState } from "react";

export default function usePoll(fetcher, { interval = 3000, maxMs = 90000, done }) {
  const [data, setData] = useState(null);
  const [polling, setPolling] = useState(false);
  const timer = useRef(null);
  const started = useRef(0);

  const stop = useCallback(() => {
    clearTimeout(timer.current);
    setPolling(false);
  }, []);

  const tick = useCallback(async () => {
    try {
      const next = await fetcher();
      setData(next);
      if (done(next) || Date.now() - started.current > maxMs) return stop();
    } catch {
      if (Date.now() - started.current > maxMs) return stop();
    }
    timer.current = setTimeout(tick, interval);
  }, [fetcher, done, interval, maxMs, stop]);

  const start = useCallback(() => {
    clearTimeout(timer.current);
    started.current = Date.now();
    setPolling(true);
    timer.current = setTimeout(tick, interval);
  }, [tick, interval]);

  useEffect(() => () => clearTimeout(timer.current), []);
  return { data, setData, polling, start, stop };
}
