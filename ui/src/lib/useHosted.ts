import { useCallback, useEffect, useRef, useState } from "react";
import { getMe, type Me } from "../api";

export type HostedState =
  | { status: "unknown"; error: string | null }
  | { status: "local" }
  | { status: "hosted"; me: Me };

const POLL_ACTIVE_MS = 2_000;
const POLL_IDLE_MS = 20_000;

const POLL_RETRY_MS = 3_000;

function cadenceFor(me: Me): number {
  if (me.queue) return POLL_ACTIVE_MS;
  if (me.session && me.session.state !== "ready") return POLL_ACTIVE_MS;

  if (me.session?.op) return POLL_ACTIVE_MS;
  return POLL_IDLE_MS;
}

export function useHosted(): { state: HostedState; refresh: () => void } {
  const [state, setState] = useState<HostedState>({ status: "unknown", error: null });
  const [nonce, setNonce] = useState(0);

  const local = useRef(false);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (local.current) return;
    let stopped = false;
    let timer = 0;

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
