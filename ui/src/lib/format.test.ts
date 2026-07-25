import { describe, expect, test } from "vitest";
import { formatClock, formatDuration, formatElapsed } from "./format";

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

describe("formatElapsed", () => {
  test("sub-10-second spans keep a decimal so fast phases aren't all 0s", () => {
    expect(formatElapsed(0)).toBe("0.0s");
    expect(formatElapsed(2140)).toBe("2.1s");
    expect(formatElapsed(9990)).toBe("10.0s");
  });

  test("seconds round once the decimal stops carrying information", () => {
    expect(formatElapsed(10_000)).toBe("10s");
    expect(formatElapsed(42_400)).toBe("42s");
  });

  test("past a minute reads as m/s with zero-padded seconds", () => {
    expect(formatElapsed(60_000)).toBe("1m 00s");
    expect(formatElapsed(64_000)).toBe("1m 04s");
    expect(formatElapsed(3_599_000)).toBe("59m 59s");
  });

  test("past an hour reads as h/m", () => {
    expect(formatElapsed(3_600_000)).toBe("1h 00m");
    expect(formatElapsed(7_380_000)).toBe("2h 03m");
  });

  test("negative spans clamp to zero rather than rendering nonsense", () => {
    // Clock skew between the conductor's stamp and the browser is real.
    expect(formatElapsed(-500)).toBe("0.0s");
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
