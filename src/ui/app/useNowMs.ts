// ABOUTME: A slow clock for relative times ("3m ago"): re-renders every 30s so
// ABOUTME: those labels stay honest without a live per-second timer.
import { useEffect, useState } from "react";

const RELATIVE_TIME_TICK_MS = 30_000;

function useNowMs(): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), RELATIVE_TIME_TICK_MS);
    return () => clearInterval(id);
  }, []);
  return nowMs;
}

export { useNowMs };
