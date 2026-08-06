import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { progressStore } from "../components/progressStore";

export type AsyncStatus = "idle" | "loading" | "success" | "error";

export interface AsyncState<T> {
  status: AsyncStatus;
  data: T | null;

  hasData: boolean;
  error: string | null;
  reload: () => void;
}

export interface UseAsyncOptions {
  background?: boolean;

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

export function useAsync<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  opts: UseAsyncOptions = {},
): AsyncState<T> {
  const { background = false, enabled = true } = opts;
  const [state, dispatch] = useReducer(callReducer<T>, undefined, initCallState<T>);
  const [nonce, setNonce] = useState(0);

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
