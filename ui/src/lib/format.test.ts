import { describe, expect, test } from "vitest";
import { formatClock, formatClockSpoken, formatDuration, formatElapsed } from "./format";

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

describe("formatClockSpoken", () => {
  test("reads hours and minutes together", () => {
    expect(formatClockSpoken(6432)).toBe("1 hour 47 minutes");
    expect(formatClockSpoken(7500)).toBe("2 hours 5 minutes");
  });

  test("a zero minutes component is dropped rather than spoken", () => {
    expect(formatClockSpoken(7200)).toBe("2 hours");
    expect(formatClockSpoken(3600)).toBe("1 hour");
  });

  test("a zero hours component is dropped rather than spoken", () => {
    expect(formatClockSpoken(300)).toBe("5 minutes");
    expect(formatClockSpoken(60)).toBe("1 minute");
  });

  test("seconds are dropped at or above a minute — the tick would re-announce", () => {
    // 1:00:59 and 1:00:00 are the same reading out loud.
    expect(formatClockSpoken(3659)).toBe("1 hour");
    expect(formatClockSpoken(119)).toBe("1 minute");
  });

  test("under a minute the seconds are the reading", () => {
    expect(formatClockSpoken(45)).toBe("45 seconds");
    expect(formatClockSpoken(1)).toBe("1 second");
    expect(formatClockSpoken(0)).toBe("0 seconds");
  });

  test("singulars are singular at every unit", () => {
    expect(formatClockSpoken(3660)).toBe("1 hour 1 minute");
    expect(formatClockSpoken(7260)).toBe("2 hours 1 minute");
  });

  test("clamps and floors exactly as formatClock does", () => {
    // Both read the same remaining-seconds value; they must not disagree.
    expect(formatClockSpoken(-5)).toBe("0 seconds");
    expect(formatClockSpoken(59.9)).toBe("59 seconds");
  });
});
