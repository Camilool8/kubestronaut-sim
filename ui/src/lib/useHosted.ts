import { useCallback, useRef, useState } from "react";
import { getMe, type Me } from "../api";
import { usePoll } from "./usePoll";

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

  // Written by the run that has just finished, read by the poll to pick the
  // next wait. null ends the loop: a facilitator with no hub behind it is
  // never going to grow one.
  const cadence = useRef<number | null>(POLL_RETRY_MS);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  usePoll(
    async () => {
      cadence.current = POLL_RETRY_MS;
      try {
        const me = await getMe();
        if (me === null) {
          cadence.current = null;
          setState({ status: "local" });
          return;
        }
        setState({ status: "hosted", me });
        cadence.current = cadenceFor(me);
      } catch (err) {
        setState((prev) =>
          prev.status === "unknown" ? { status: "unknown", error: String(err) } : prev,
        );
      }
    },
    () => cadence.current,
    // Once the app knows it is local, a refresh must not start it polling a
    // hub that is not there.
    { enabled: state.status !== "local", restartKey: nonce },
  );

  return { state, refresh };
}
