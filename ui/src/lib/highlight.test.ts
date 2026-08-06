import { describe, expect, test, vi } from "vitest";

type Loader = { attempts: number; failing: boolean };

async function freshHighlight(loader: Loader) {
  vi.resetModules();
  vi.doMock("highlight.js/lib/core", async () => {
    loader.attempts++;

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

    expect(loader.attempts).toBe(0);
  });

  test("returns null rather than throwing when the engine fails to load", async () => {
    const loader: Loader = { attempts: 0, failing: true };
    const { highlightTo } = await freshHighlight(loader);
    expect(await highlightTo("yaml", "a: 1")).toBeNull();
  });

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
