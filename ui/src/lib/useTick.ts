import { useEffect, useState } from "react";

/**
 * Re-renders on an interval so a component can recompute a duration from a
 * server timestamp. Returns the current wall clock.
 *
 * Deliberately not a countdown: nothing here decrements a stored number, so
 * a tab that was throttled in the background resyncs on its next tick
 * instead of drifting. `active` false stops the interval entirely — a
 * settled job's clock should freeze, not keep counting.
 */
export function useTick(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);

  return now;
}
