import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError, endSession, getSession, isEnvironmentStarting, startSession } from "./api";
import { POINTER_HEADER, TOUCH_ONLY_QUERY } from "./lib/deviceCapability";
import { progressStore } from "./components/progressStore";
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

describe("the progress bar and mutations", () => {
  beforeEach(() => {
    matchMediaMock([]);
    progressStore.reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    progressStore.reset();
  });

  /** Resolves only when `release()` is called, so the request stays in flight. */
  function heldFetch() {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal("fetch", async () => {
      await held;
      return new Response(JSON.stringify({ state: "idle" }), { status: 200 });
    });
    return { release: () => release?.() };
  }

  test("a mutation in flight raises the bar", async () => {
    const { release } = heldFetch();

    const done = endSession();
    await vi.waitFor(() => expect(progressStore.isVisible()).toBe(true));

    release();
    await done;
  });

  test("the bar drops once the mutation settles", async () => {
    const { release } = heldFetch();

    const done = endSession();
    await vi.waitFor(() => expect(progressStore.isVisible()).toBe(true));
    release();
    await done;

    await vi.waitFor(() => expect(progressStore.isVisible()).toBe(false));
  });

  test("a failed mutation still drops the bar", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });

    await endSession().catch(() => undefined);

    expect(progressStore.isVisible()).toBe(false);
  });

  // pollSession runs a GET every second for the life of the app. Counting GETs
  // here would pin the bar on permanently; useAsync already drives it for the
  // loads that are worth showing.
  test("a poll does not touch the bar", async () => {
    const { release } = heldFetch();

    const done = getSession();
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(progressStore.isVisible()).toBe(false);

    release();
    await done;
  });
});
