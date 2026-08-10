import { useEffect, useRef } from "react";

// Every poll in this app is the same loop: run something, decide how long to
// wait, run it again. Writing it out seven times meant seven chances to get
// the teardown wrong and, more to the point, seven pollers that carried on
// fetching in a background tab. The visibility handling lives here so there is
// exactly one place that has to be right.

// A fixed cadence, or a function called after each run to pick the next wait.
// Returning null from that function ends the loop: the poll has nothing left
// to ask for, and only a restart (or `enabled` cycling) starts it again.
export type PollInterval = number | (() => number | null);

export interface PollOptions {
  // While false the loop is torn down entirely. Flipping it back to true
  // starts a fresh one, which runs immediately rather than waiting a cadence.
  enabled?: boolean;

  // Any change restarts the loop with an immediate run, for the cases where
  // something the app just did makes the current wait obsolete.
  restartKey?: unknown;
}

export function usePoll(
  fn: () => void | Promise<void>,
  interval: PollInterval,
  options: PollOptions = {},
): void {
  const { enabled = true, restartKey } = options;

  // Both are read at tick time, never closed over by the loop, so a caller can
  // write `fn` and `interval` inline against fresh props without restarting
  // the poll on every render.
  const fnRef = useRef(fn);
  const intervalRef = useRef(interval);
  useEffect(() => {
    fnRef.current = fn;
    intervalRef.current = interval;
  });

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let finished = false;
    let inFlight = false;
    let timer = 0;

    const clearPending = () => {
      window.clearTimeout(timer);
      timer = 0;
    };

    const schedule = () => {
      if (stopped || finished) return;
      const spec = intervalRef.current;
      const ms = typeof spec === "function" ? spec() : spec;
      if (typeof ms !== "number" || !Number.isFinite(ms)) {
        finished = true;
        return;
      }
      // A hidden tab gets no timer at all. onVisibility restarts the loop when
      // the tab comes back, so nothing is lost by not queueing one.
      if (document.hidden) return;
      timer = window.setTimeout(tick, Math.max(0, ms));
    };

    const tick = async () => {
      timer = 0;
      if (stopped || finished || inFlight || document.hidden) return;
      inFlight = true;
      try {
        await fnRef.current();
      } catch {
        // A poll's errors are the caller's to report; the loop only decides
        // whether to keep going, and a failed run is not a reason to stop.
      } finally {
        inFlight = false;
      }
      schedule();
    };

    // Coming back to the tab is worth a fresh read now, not at the end of a
    // wait that started before the user left.
    const wake = () => {
      if (stopped || finished || inFlight || document.hidden) return;
      clearPending();
      void tick();
    };

    const onVisibility = () => {
      if (document.hidden) {
        clearPending();
      } else {
        wake();
      }
    };

    void tick();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", wake);

    return () => {
      stopped = true;
      clearPending();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", wake);
    };
  }, [enabled, restartKey]);
}
