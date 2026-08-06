import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError, getSession, isEnvironmentStarting, startSession } from "./api";
import { POINTER_HEADER, TOUCH_ONLY_QUERY } from "./lib/deviceCapability";
import { matchMediaMock } from "./test/setup";

describe("ApiError", () => {
  test("stringifies exactly as a plain Error does", () => {
    const err = new ApiError(503, "your exam environment is still starting", "environment_starting");
    expect(String(err)).toBe("Error: your exam environment is still starting");
  });

  test("keeps the parts a caller branches on", () => {
    const err = new ApiError(503, "still starting", "environment_starting");
    expect(err.status).toBe(503);
    expect(err.code).toBe("environment_starting");
    expect(err instanceof Error).toBe(true);
  });

  test("recognises the hub's Pod-replacement wait and nothing else", () => {
    expect(isEnvironmentStarting(new ApiError(503, "x", "environment_starting"))).toBe(true);
    expect(isEnvironmentStarting(new ApiError(502, "x", "environment_unreachable"))).toBe(false);
    expect(isEnvironmentStarting(new ApiError(500, "x"))).toBe(false);
    expect(isEnvironmentStarting(new Error("your exam environment is still starting"))).toBe(false);
  });
});

describe("the pointer header", () => {
  afterEach(() => {
    matchMediaMock([]);
    vi.unstubAllGlobals();
  });

  function captureFetch() {
    const calls: RequestInit[] = [];
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      calls.push(init);
      return Promise.resolve(
        new Response(JSON.stringify({ state: "idle" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    return calls;
  }

  function headerOf(init: RequestInit): string | undefined {
    return (init.headers as Record<string, string> | undefined)?.[POINTER_HEADER];
  }

  test("a GET with no options of its own still declares the device", async () => {
    matchMediaMock([TOUCH_ONLY_QUERY]);
    const calls = captureFetch();
    await getSession();
    expect(headerOf(calls[0])).toBe("coarse");
  });

  test("a laptop declares itself too — the server needs the positive answer", async () => {
    matchMediaMock([]);
    const calls = captureFetch();
    await getSession();
    expect(headerOf(calls[0])).toBe("fine");
  });

  test("a POST keeps its Content-Type alongside the new header", async () => {
    matchMediaMock([TOUCH_ONLY_QUERY]);
    const calls = captureFetch();
    await startSession("exam");
    const headers = calls[0].headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers[POINTER_HEADER]).toBe("coarse");
  });
});
