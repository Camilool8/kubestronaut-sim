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

    await act(async () => {
      settleFirst("stale");
      await Promise.resolve();
    });
    expect(result.current.data).toBe("second");
  });

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

    expect(progressStore.isVisible()).toBe(false);
    expect(result.current.status).toBe("loading");
  });

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
