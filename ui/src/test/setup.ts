import "@testing-library/jest-dom/vitest";
import { afterEach, expect } from "vitest";
import { cleanup } from "@testing-library/react";
import * as axeMatchers from "vitest-axe/matchers";

expect.extend(axeMatchers);

// vitest runs without injected globals, so testing-library's automatic
// per-test cleanup never registers itself; do it explicitly.
afterEach(cleanup);

// jsdom 29 no longer ships a functional localStorage; provide a real
// in-memory Storage so code under test uses the standard API.
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

// Same story for sessionStorage, which marksStore uses to keep a
// candidate's viewed/marked flags across a reload mid-exam.
Object.defineProperty(window, "sessionStorage", {
  value: new MemoryStorage(),
  configurable: true,
});

// jsdom has no CSS engine and therefore no matchMedia. Default every
// query to "no match", which is the desktop case — components that gate
// on viewport or pointer then behave as they would on a laptop unless a
// test opts in with matchMediaMock().
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

/**
 * Makes the listed queries match. Pass the exported query constants
 * (NARROW_QUERY, TOUCH_ONLY_QUERY) so a test states the device it is
 * simulating rather than duplicating a media string.
 */
export function matchMediaMock(matching: string[]): void {
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => matchMediaResult(query, matching.includes(query)),
    configurable: true,
    writable: true,
  });
}
