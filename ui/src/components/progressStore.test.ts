import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { progressStore } from "./progressStore";

beforeEach(() => {
  vi.useFakeTimers();
  progressStore.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("progressStore", () => {
  test("stays hidden for work that finishes quickly", () => {
    progressStore.start();
    vi.advanceTimersByTime(150);
    progressStore.done();
    vi.advanceTimersByTime(1000);
    // A local fetch that resolves in 150ms must not flash a bar.
    expect(progressStore.isVisible()).toBe(false);
  });

  test("shows once work outlasts the delay", () => {
    progressStore.start();
    vi.advanceTimersByTime(250);
    expect(progressStore.isVisible()).toBe(true);
  });

  test("stays visible for the minimum once shown", () => {
    progressStore.start();
    vi.advanceTimersByTime(250);
    progressStore.done();
    vi.advanceTimersByTime(100);
    expect(progressStore.isVisible()).toBe(true);
    vi.advanceTimersByTime(250);
    expect(progressStore.isVisible()).toBe(false);
  });

  test("tracks concurrent work and hides only when all of it settles", () => {
    progressStore.start();
    progressStore.start();
    vi.advanceTimersByTime(250);
    progressStore.done();
    vi.advanceTimersByTime(400);
    expect(progressStore.isVisible()).toBe(true);
    progressStore.done();
    vi.advanceTimersByTime(400);
    expect(progressStore.isVisible()).toBe(false);
  });
});
