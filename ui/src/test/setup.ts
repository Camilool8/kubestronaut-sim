import "@testing-library/jest-dom/vitest";
import { afterEach, expect } from "vitest";
import { cleanup } from "@testing-library/react";
import * as axeMatchers from "vitest-axe/matchers";

expect.extend(axeMatchers);

afterEach(cleanup);

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number) {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

Object.defineProperty(window, "localStorage", {
  value: new MemoryStorage(),
  configurable: true,
});

Object.defineProperty(window, "sessionStorage", {
  value: new MemoryStorage(),
  configurable: true,
});

for (const method of ["setPointerCapture", "releasePointerCapture"] as const) {
  Object.defineProperty(Element.prototype, method, {
    value: () => {},
    configurable: true,
    writable: true,
  });
}
Object.defineProperty(Element.prototype, "hasPointerCapture", {
  value: () => false,
  configurable: true,
  writable: true,
});

Object.defineProperty(window, "matchMedia", {
  value: (query: string) => matchMediaResult(query, false),
  configurable: true,
  writable: true,
});

function matchMediaResult(query: string, matches: boolean): MediaQueryList {
  return {
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}

export function matchMediaMock(matching: string[]): void {
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => matchMediaResult(query, matching.includes(query)),
    configurable: true,
    writable: true,
  });
}
