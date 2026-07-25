import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAsync } from "./useAsync";
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

  test("a resolution after unmount does not set state", async () => {
    let settle: (v: string) => void = () => {};
    const { result, unmount } = renderHook(() =>
      useAsync(() => new Promise<string>((r) => (settle = r)), []),
    );
    unmount();
    settle("late");
    await Promise.resolve();
    expect(result.current.status).toBe("loading");
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
});
