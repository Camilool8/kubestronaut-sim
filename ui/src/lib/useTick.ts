import { useEffect, useState } from "react";

export function useTick(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    let id = 0;
    const schedule = () => {
      id = window.setTimeout(tick, intervalMs - (Date.now() % intervalMs));
    };
    const tick = () => {
      setNow(Date.now());
      schedule();
    };
    schedule();
    return () => window.clearTimeout(id);
  }, [active, intervalMs]);

  return now;
}
