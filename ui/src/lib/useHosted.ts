import { useCallback, useEffect, useRef, useState } from "react";
import { getMe, type Me } from "../api";

/**
 * Which product this browser is talking to, and — when it is the hosted
 * one — who the candidate is and what they have.
 *
 * `unknown` is a real state and not a loading flicker to be skipped: a
 * facilitator that is still starting has not said it is local yet, and
 * rendering the local app on that assumption puts an exam selector in
 * front of someone who has not signed in. Every screen waits.
 */
export type HostedState =
  | { status: "unknown"; error: string | null }
  | { status: "local" }
  | { status: "hosted"; me: Me };

/**
 * How often /api/me is re-asked.
 *
 * Fast while something is expected to change on its own — a Pod booting,
 * a place in a queue moving — and slow otherwise, where it is only
 * keeping the lease countdown honest and noticing a session reaped from
 * under the tab. It is also the hub's idle signal: the reaper takes back
 * a seat nobody has asked about, so a tab left open on the lobby with no
 * poll at all would look abandoned.
 */
const POLL_ACTIVE_MS = 2_000;
const POLL_IDLE_MS = 20_000;
/** Retry cadence before the first answer, when nothing is known yet. */
const POLL_RETRY_MS = 3_000;

function cadenceFor(me: Me): number {
  if (me.queue) return POLL_ACTIVE_MS;
  if (me.session && me.session.state !== "ready") return POLL_ACTIVE_MS;
  return POLL_IDLE_MS;
}

/**
 * Poll GET /api/me.
 *
 * Stops permanently once it answers `local`. That is not an optimisation
 * — it is the property that keeps `./sim up` byte-identical: a local
 * facilitator must never see a repeating request for a route it does not
 * have, filling its log with 404s for a hub that is not there.
 */
export function useHosted(): { state: HostedState; refresh: () => void } {
  const [state, setState] = useState<HostedState>({ status: "unknown", error: null });
  const [nonce, setNonce] = useState(0);
  // Survives the effect re-running, which is the point: refresh() must
  // not be able to restart a poll that has already established there is
  // no hub to poll.
  const local = useRef(false);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (local.current) return;
    let stopped = false;
    let timer = 0;

    // The next delay is computed from the answer just received rather
    // than from `state`, so this effect does not depend on the value it
    // sets — which would re-run it on every poll and turn the timer into
    // a busy loop.
    const tick = async () => {
      let next = POLL_RETRY_MS;
      try {
        const me = await getMe();
        if (stopped) return;
        if (me === null) {
          local.current = true;
          setState({ status: "local" });
          return;
        }
        setState({ status: "hosted", me });
        next = cadenceFor(me);
      } catch (err) {
        // Expected during a cold start, and expected again for a moment
        // whenever the hub is redeployed. The error is only shown while
        // nothing is known yet: once identity has arrived, a failed poll
        // leaves the last answer on screen rather than blanking a
        // signed-in candidate back to a sign-in page.
        if (stopped) return;
        setState((prev) =>
          prev.status === "unknown" ? { status: "unknown", error: String(err) } : prev,
        );
      }
      if (!stopped) timer = window.setTimeout(tick, next);
    };

    tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [nonce]);

  return { state, refresh };
}
