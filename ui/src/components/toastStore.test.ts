import { beforeEach, describe, expect, test, vi } from "vitest";
import { toastStore } from "./toastStore";

describe("toastStore", () => {
  beforeEach(() => {
    toastStore.clear();
    vi.useRealTimers();
  });

  test("push notifies subscribers with the new toast", () => {
    const seen: number[] = [];
    const unsub = toastStore.subscribe(() => seen.push(toastStore.list().length));

    toastStore.push({ kind: "info", message: "saved" });
    expect(seen).toContain(1);
    expect(toastStore.list()[0]).toMatchObject({ kind: "info", message: "saved" });
    unsub();
  });

  test("info toasts auto-dismiss after their ttl; warnings are sticky", () => {
    vi.useFakeTimers();
    toastStore.push({ kind: "info", message: "transient" });
    toastStore.push({ kind: "warning", message: "5 minutes remaining" });
    expect(toastStore.list()).toHaveLength(2);

    vi.advanceTimersByTime(6_000);
    const remaining = toastStore.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].kind).toBe("warning");
  });

  test("dismiss removes a toast by id", () => {
    const id = toastStore.push({ kind: "warning", message: "sticky" });
    expect(toastStore.list()).toHaveLength(1);
    toastStore.dismiss(id);
    expect(toastStore.list()).toHaveLength(0);
  });

  test("pushing the same dedupe key replaces instead of stacking", () => {
    toastStore.push({ kind: "warning", message: "reconnecting", dedupeKey: "desktop" });
    toastStore.push({ kind: "warning", message: "still reconnecting", dedupeKey: "desktop" });
    expect(toastStore.list()).toHaveLength(1);
    expect(toastStore.list()[0].message).toBe("still reconnecting");
  });

  test("unsubscribe stops notifications", () => {
    const spy = vi.fn();
    const unsub = toastStore.subscribe(spy);
    unsub();
    toastStore.push({ kind: "info", message: "x" });
    expect(spy).not.toHaveBeenCalled();
  });
});
