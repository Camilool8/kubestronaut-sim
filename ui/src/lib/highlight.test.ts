import { describe, expect, test, vi } from "vitest";

type Loader = { attempts: number; failing: boolean };

/**
 * Loads a fresh copy of the module under test with the highlight.js core
 * import under our control. The engine promise is memoised at module scope,
 * so every case needs its own instance — hence resetModules and the dynamic
 * import. Only the core is mocked; the three grammars load for real, which
 * is what makes the recovered call produce genuine highlighted HTML.
 */
async function freshHighlight(loader: Loader) {
  vi.resetModules();
  vi.doMock("highlight.js/lib/core", async () => {
    loader.attempts++;
    // A chunk that never arrives surfaces to the app as a rejected import():
    // the same shape a dropped connection or a swapped-out asset produces.
    if (loader.failing) throw new Error("Failed to fetch dynamically imported module");
    return await vi.importActual<typeof import("highlight.js/lib/core")>("highlight.js/lib/core");
  });
  return await import("./highlight");
}

describe("highlightTo", () => {
  test("highlights a supported language", async () => {
    const loader: Loader = { attempts: 0, failing: false };
    const { highlightTo } = await freshHighlight(loader);
    expect(await highlightTo("yaml", "a: 1")).toContain("hljs-attr");
  });

  test("returns null for a language the bank does not use", async () => {
    const loader: Loader = { attempts: 0, failing: false };
    const { highlightTo } = await freshHighlight(loader);
    expect(await highlightTo("rust", "fn main() {}")).toBeNull();
    // The engine is dead weight for an unsupported listing; a candidate who
    // only ever opens one must not download it.
    expect(loader.attempts).toBe(0);
  });

  test("returns null rather than throwing when the engine fails to load", async () => {
    const loader: Loader = { attempts: 0, failing: true };
    const { highlightTo } = await freshHighlight(loader);
    expect(await highlightTo("yaml", "a: 1")).toBeNull();
  });

  // The regression guard. A rejected load used to stay in the cache slot for
  // the life of the tab: every later call awaited the same rejection and
  // returned null, so a one-second network fault killed highlighting for the
  // whole session. Restore the plain `enginePromise = (async () => …)()`
  // assignment and this fails — the second call never re-imports (attempts
  // stays at 1) and comes back null.
  test("a failed load does not poison the next call", async () => {
    const loader: Loader = { attempts: 0, failing: true };
    const { highlightTo } = await freshHighlight(loader);
    expect(await highlightTo("yaml", "a: 1")).toBeNull();
    expect(loader.attempts).toBe(1);

    loader.failing = false;
    const recovered = await highlightTo("yaml", "a: 1");
    expect(loader.attempts).toBe(2);
    expect(recovered).toContain("hljs-attr");
  });

  test("callers already awaiting a failed load all see it fail", async () => {
    const loader: Loader = { attempts: 0, failing: true };
    const { highlightTo } = await freshHighlight(loader);
    const results = await Promise.all([highlightTo("yaml", "a: 1"), highlightTo("json", "{}")]);
    expect(results).toEqual([null, null]);
    // Clearing the slot on rejection must not turn one bad load into one
    // load per code block on screen: the slot only empties once the failure
    // has settled, so concurrent callers still share a single attempt.
    expect(loader.attempts).toBe(1);
  });

  test("a load that succeeded is still only paid for once", async () => {
    const loader: Loader = { attempts: 0, failing: false };
    const { highlightTo } = await freshHighlight(loader);
    await highlightTo("yaml", "a: 1");
    await highlightTo("bash", "echo hi");
    expect(loader.attempts).toBe(1);
  });
});
