import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { progressStore } from "../components/progressStore";

export type AsyncStatus = "idle" | "loading" | "success" | "error";

export interface AsyncState<T> {
  status: AsyncStatus;
  data: T | null;
  /**
   * Whether a successful call has ever landed. Distinct from `data !== null`,
   * which cannot tell "resolved with nothing" from "never resolved" — a
   * `useAsync<void>` would report itself loaded forever under that test.
   */
  hasData: boolean;
  error: string | null;
  reload: () => void;
}

export interface UseAsyncOptions {
  /**
   * Pollers pass true. A repeating call must not drive the global bar —
   * the results poll (3s) and the busy control poll (2s) would otherwise
   * leave it up permanently. The bar reflects work the user is waiting
   * on, not every request in flight.
   */
  background?: boolean;
  /** When false the function is never called and status stays "idle". */
  enabled?: boolean;
}

interface CallState<T> {
  status: AsyncStatus;
  data: T | null;
  hasData: boolean;
  error: string | null;
}

type CallAction<T> =
  | { type: "start" }
  | { type: "success"; data: T }
  | { type: "error"; message: string };

export function callReducer<T>(state: CallState<T>, action: CallAction<T>): CallState<T> {
  switch (action.type) {
    case "start":
      // Bail out when nothing would change. An unstable dep entry (e.g. an
      // inline object/array literal in the caller's deps array) makes the
      // effect re-run every render; without this guard dispatch({type:
      // "start"}) would always allocate a new state object, driving a
      // render -> effect -> dispatch cascade that never settles. The
      // three-useState version this replaced degraded to a request storm
      // in that case instead of a runaway loop, so this bail-out is the
      // one place the reducer conversion has to match that behavior.
      return state.status === "loading" && state.error === null
        ? state
        : { status: "loading", data: state.data, hasData: state.hasData, error: null };
    case "success":
      return { status: "success", data: action.data, hasData: true, error: null };
    case "error":
      return { status: "error", data: state.data, hasData: state.hasData, error: action.message };
  }
}

function initCallState<T>(): CallState<T> {
  return { status: "idle", data: null, hasData: false, error: null };
}

/**
 * Runs an async function and reports its state, aborting on unmount.
 * Replaces the per-call-site `cancelled` flag pattern.
 *
 * `fn` receives an AbortSignal. Pass it to fetch: the old `cancelled` flag
 * only ignored a late result while the request itself kept running, and a
 * request against an unresponsive facilitator never settles at all.
 */
export function useAsync<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  opts: UseAsyncOptions = {},
): AsyncState<T> {
  const { background = false, enabled = true } = opts;
  const [state, dispatch] = useReducer(callReducer<T>, undefined, initCallState<T>);
  const [nonce, setNonce] = useState(0);

  // The caller almost always passes an inline closure; keeping it in a ref
  // means a new identity per render does not re-trigger the effect, while
  // the effect still calls the latest one. Synced in its own effect (rather
  // than during render) so it runs after every commit, before the effect
  // below in the same pass.
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const controller = new AbortController();
    dispatch({ type: "start" });
    if (!background) progressStore.start();

    // Promise.resolve().then(...) rather than calling fn directly: a
    // synchronously-throwing fn would otherwise escape the effect after
    // progressStore.start() and before its matching done(), leaving the top
    // bar up for the rest of the session with nothing in flight.
    Promise.resolve()
      .then(() => fnRef.current(controller.signal))
      .then((value) => {
        if (cancelled) return;
        dispatch({ type: "success", data: value });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
      })
      .finally(() => {
        if (!background) progressStore.done();
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // deps is the caller's dependency list, spread so each entry is compared
    // individually; nonce drives reload().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, enabled, background]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return {
    status: state.status,
    data: state.data,
    hasData: state.hasData,
    error: state.error,
    reload,
  };
}
