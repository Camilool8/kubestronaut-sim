import { afterEach, describe, expect, test } from "vitest";
import { POINTER_HEADER, TOUCH_ONLY_QUERY, pointerClass, pointerHeader } from "./deviceCapability";
import { matchMediaMock } from "../test/setup";

afterEach(() => {
  matchMediaMock([]);
});

describe("pointerClass", () => {
  test("a phone or tablet reports coarse", () => {
    matchMediaMock([TOUCH_ONLY_QUERY]);
    expect(pointerClass()).toBe("coarse");
  });

  test("a laptop reports fine", () => {
    matchMediaMock([]);
    expect(pointerClass()).toBe("fine");
  });

  // A touchscreen laptop matches `any-pointer: coarse` AND
  // `any-pointer: fine`, so the query as a whole does not match and it
  // is reported as what it is. The gate exists for the missing keyboard,
  // and this device has one.
  test("a touchscreen laptop reports fine", () => {
    matchMediaMock([]);
    expect(pointerClass()).toBe("fine");
  });

  test("a host with no matchMedia reports nothing rather than guessing", () => {
    const saved = window.matchMedia;
    // @ts-expect-error deleting a DOM global for the duration of one test
    delete window.matchMedia;
    try {
      expect(pointerClass()).toBeUndefined();
    } finally {
      window.matchMedia = saved;
    }
  });

  test("a matchMedia that throws reports nothing rather than crashing the fetch", () => {
    const saved = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      value: () => {
        throw new Error("unsupported query");
      },
      configurable: true,
      writable: true,
    });
    try {
      expect(pointerClass()).toBeUndefined();
    } finally {
      window.matchMedia = saved;
    }
  });
});

describe("pointerHeader", () => {
  test("names the header the Go services read", () => {
    matchMediaMock([TOUCH_ONLY_QUERY]);
    expect(pointerHeader()).toEqual({ [POINTER_HEADER]: "coarse" });
  });

  // The server admits a request that says nothing, so an unknown device
  // must send nothing at all rather than a guess that would be
  // indistinguishable from a measurement.
  test("is empty when the device could not be read", () => {
    const saved = window.matchMedia;
    // @ts-expect-error deleting a DOM global for the duration of one test
    delete window.matchMedia;
    try {
      expect(pointerHeader()).toEqual({});
    } finally {
      window.matchMedia = saved;
    }
  });
});
