import { useEffect, useRef } from "react";
import { navigate } from "./useHashRoute";
import type { HostedState } from "./useHosted";

/**
 * Where a hosted candidate lands when their environment comes up.
 *
 * A hosted seat is scoped to one exam: the Pod is stamped and sized for
 * it, and the selector inside the session offers no other. So the exam
 * picker at the end of a boot is a screen with a single card on it,
 * asking the candidate to re-confirm the choice they made in the lobby —
 * and at the end of a rebuild it reads as having been thrown out of the
 * attempt they asked to repeat.
 *
 * Two guards, and both matter:
 *
 *   - It fires only on a transition into ready that this tab WATCHED. A
 *     page load that finds a session already ready is not mid-anything,
 *     and moving it would take a candidate off whatever they had open.
 *   - It yields to a route they are deliberately on. Progress and a past
 *     attempt are about their record rather than their environment, and a
 *     rebuild finishing behind them must not close what they are reading.
 *
 * Mode.tsx bounces to /exams when the facilitator's active exam is not
 * the bank in the route, so a wrong guess here costs exactly the screen
 * this replaces and nothing more.
 */
export function useSeatLanding(state: HostedState): void {
  const seen = useRef(false);
  const wasReady = useRef(false);

  useEffect(() => {
    // `unknown` is the placeholder useHosted() renders for exactly one
    // tick before its first /api/me answers — never real session data.
    // Treating it as the baseline observation would make every page load
    // read as a watched transition the instant real data arrived, which
    // is the "page load into an already-ready seat" case the first guard
    // exists to exclude.
    if (state.status === "unknown") return;

    const session = state.status === "hosted" ? state.me.session : undefined;
    const ready = session?.state === "ready";
    const bank = session?.bank;

    // The first observation establishes a baseline and never navigates.
    if (!seen.current) {
      seen.current = true;
      wasReady.current = ready;
      return;
    }
    const arrived = ready && !wasReady.current;
    wasReady.current = ready;
    if (!arrived || !bank) return;

    const here = window.location.hash.replace(/^#\/?/, "").split("/")[0];
    if (here === "progress" || here === "history" || here === "exams") return;
    navigate(`/exams/${bank}/mode`, { replace: true });
  }, [state]);
}
