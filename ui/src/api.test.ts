import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError, getSession, isEnvironmentStarting, startSession } from "./api";
import { POINTER_HEADER, TOUCH_ONLY_QUERY } from "./lib/deviceCapability";
import { matchMediaMock } from "./test/setup";

describe("ApiError", () => {
  // Everything that renders one of these renders `${err}`, and the
  // toast copy is asserted elsewhere by its full text. Setting `name`
  // would silently reword every one of them.
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

/**
 * The device fact rides every request, not only the two that need it
 * today. A call site that has to remember a header is one that will
 * forget it, and the server has to be able to read an absent header as
 * "this client could not tell" rather than "this fetch was written
 * before the rule existed".
 */
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

  // The header is merged into the caller's own, and Content-Type is the
  // one every POST sets. Losing it would send a JSON body the server
  // reads as a form.
  test("a POST keeps its Content-Type alongside the new header", async () => {
    matchMediaMock([TOUCH_ONLY_QUERY]);
    const calls = captureFetch();
    await startSession("exam");
    const headers = calls[0].headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers[POINTER_HEADER]).toBe("coarse");
  });
});
