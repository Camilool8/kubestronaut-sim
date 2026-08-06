import { useEffect, useRef } from "react";
import { navigate } from "./useHashRoute";
import type { HostedState } from "./useHosted";

export function useSeatLanding(state: HostedState): void {
  const seen = useRef(false);
  const wasReady = useRef(false);

  useEffect(() => {
    if (state.status === "unknown") return;

    const session = state.status === "hosted" ? state.me.session : undefined;
    const ready = session?.state === "ready";
    const bank = session?.bank;

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
