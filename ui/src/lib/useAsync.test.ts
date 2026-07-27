import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAsync, callReducer } from "./useAsync";
import { progressStore } from "../components/progressStore";

beforeEach(() => {
  progressStore.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useAsync", () => {
  test("reports success and exposes the data", async () => {
    const { result } = renderHook(() => useAsync(async () => "value", []));
    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.data).toBe("value");
    expect(result.current.error).toBeNull();
  });

  test("reports the message from a rejection", async () => {
    const { result } = renderHook(() =>
      useAsync(async () => {
        throw new Error("HTTP 502");
      }, []),
    );
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("HTTP 502");
  });

  test("reload re-runs the function", async () => {
    const fn = vi.fn(async () => "value");
    const { result } = renderHook(() => useAsync(fn, []));
    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(fn).toHaveBeenCalledTimes(1);
    result.current.reload();
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
  });

  // A prior version of this test unmounted, resolved a stale promise, and
  // asserted `result.current.status` was still "loading". That proved
  // nothing: React 18 makes dispatch-after-unmount a silent no-op, and
  // `result.current` never updates post-unmount regardless of whether the
  // `cancelled` guard exists — so the assertion passed even with the guard
  // deleted entirely. This drives the same guard through a path that stays
  // observable: a dep change starts a second call while the first is still
  // in flight, and the first's late resolution must not clobber the
  // second's result. Deleting the `cancelled` check makes this fail.
  test("a resolution from a superseded call does not clobber a newer one", async () => {
    let settleFirst: (v: string) => void = () => {};
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) =>
        useAsync(
          () => (id === 1 ? new Promise<string>((r) => (settleFirst = r)) : Promise.resolve("second")),
          [id],
        ),
      { initialProps: { id: 1 } },
    );
    rerender({ id: 2 });
    await waitFor(() => expect(result.current.data).toBe("second"));
    // act() forces React to flush the update the late .then would schedule,
    // rather than leaving it on the Scheduler's macrotask queue where a
    // bare `await Promise.resolve()` would never observe it either way.
    await act(async () => {
      settleFirst("stale");
      await Promise.resolve();
    });
    expect(result.current.data).toBe("second");
  });

  // The fnRef-sync effect must be declared before the data-fetching effect
  // so it runs first in the same commit; otherwise the fetch reads a stale
  // closure whenever deps change. This is the regression guard for that
  // ordering: a reorder makes the second call see the pre-rerender `id`
  // again, so `seen` ends up [1, 1] and `data` stays 1 instead of 2.
  test("uses the latest closure after a dep change (guards effect declaration order)", async () => {
    const seen: number[] = [];
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) =>
        useAsync(async () => {
          seen.push(id);
          return id;
        }, [id]),
      { initialProps: { id: 1 } },
    );
    await waitFor(() => expect(result.current.data).toBe(1));
    rerender({ id: 2 });
    await waitFor(() => expect(result.current.data).toBe(2));
    expect(seen).toEqual([1, 2]);
  });

  test("background calls do not touch the progress bar", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useAsync(() => new Promise<string>(() => {}), [], { background: true }),
    );
    vi.advanceTimersByTime(500);
    // A 3s results poll must not leave the bar up permanently.
    expect(progressStore.isVisible()).toBe(false);
    expect(result.current.status).toBe("loading");
  });

  // The bar is driven from a start/done pair. A synchronously-throwing fn
  // used to escape between them, so one bad call site left the bar up for
  // the rest of the session with nothing in flight.
  test("a synchronously throwing function does not strand the progress bar", async () => {
    const { result } = renderHook(() =>
      useAsync<string>(() => {
        throw new Error("boom");
      }, []),
    );
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("boom");
    await waitFor(() => expect(progressStore.isVisible()).toBe(false));
  });

  // The old `cancelled` flag only ignored a late result; the request itself
  // kept running, and against a wedged server it never settled at all.
  test("unmounting aborts the signal handed to the call", async () => {
    let signal: AbortSignal | undefined;
    const { unmount } = renderHook(() =>
      useAsync((s) => {
        signal = s;
        return new Promise<string>(() => {});
      }, []),
    );
    await waitFor(() => expect(signal).toBeDefined());
    expect(signal!.aborted).toBe(false);
    unmount();
    expect(signal!.aborted).toBe(true);
  });
});

describe("callReducer", () => {
  // An unstable dep entry (e.g. useAsync(fn, [{}])) re-runs the effect every
  // render, dispatching "start" every time. If "start" always allocated a
  // new object, that would drive an unbroken render -> effect -> dispatch
  // loop — a real OOM risk, not just a wasted render. The bail-out below is
  // what keeps that case a request storm instead of a crash, matching the
  // three-useState version this reducer replaced (a useState setter with an
  // unchanged value already skips the re-render).
  test("start returns the same reference when already loading with no error", () => {
    const state = { status: "loading" as const, data: null, hasData: false, error: null };
    expect(callReducer(state, { type: "start" })).toBe(state);
  });

  test("start allocates when transitioning out of idle", () => {
    const state = { status: "idle" as const, data: null, hasData: false, error: null };
    const next = callReducer(state, { type: "start" });
    expect(next).not.toBe(state);
    expect(next).toEqual({ status: "loading", data: null, hasData: false, error: null });
  });

  test("start allocates to clear a previous error", () => {
    const state = { status: "error" as const, data: null, hasData: false, error: "HTTP 502" };
    const next = callReducer(state, { type: "start" });
    expect(next).not.toBe(state);
    expect(next).toEqual({ status: "loading", data: null, hasData: false, error: null });
  });
});
