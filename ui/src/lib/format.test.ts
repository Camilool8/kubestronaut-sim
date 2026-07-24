import { describe, expect, test } from "vitest";
import { formatClock, formatDuration } from "./format";

describe("formatDuration", () => {
  test("whole hours render without minutes", () => {
    expect(formatDuration(7200)).toBe("2h");
  });

  test("hours and minutes render together", () => {
    expect(formatDuration(5400)).toBe("1h 30m");
  });

  test("sub-hour durations render minutes only", () => {
    expect(formatDuration(2700)).toBe("45m");
  });
});

describe("formatClock", () => {
  test("renders H:MM:SS with zero-padded minutes and seconds", () => {
    expect(formatClock(7200)).toBe("2:00:00");
    expect(formatClock(3661)).toBe("1:01:01");
  });

  test("clamps negative values to zero", () => {
    expect(formatClock(-5)).toBe("0:00:00");
  });

  test("floors fractional seconds", () => {
    expect(formatClock(59.9)).toBe("0:00:59");
  });
});
