import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { clipboardSync } from "./clipboardSync";
import { desktopClipboard, type ClipboardTarget } from "./desktopClipboard";

function fakeTarget(): ClipboardTarget & { pasted: string[] } {
  const pasted: string[] = [];
  return { pasted, clipboardPasteFrom: (text: string) => void pasted.push(text) };
}

function stubSelection(text: string) {
  Object.defineProperty(window, "getSelection", {
    value: () => ({ toString: () => text }),
    configurable: true,
  });
}

function stubClipboard(clipboard: Partial<Clipboard>) {
  Object.defineProperty(navigator, "clipboard", {
    value: clipboard,
    configurable: true,
  });
}

/**
 * Drains every microtask already queued, however many `.then` hops deep,
 * without hardcoding a tick count: a macrotask boundary (a real timer)
 * always runs after all microtasks queued ahead of it have settled. Used
 * where a fixed number of `await Promise.resolve()` would work today but
 * silently stop covering the code the moment another `await` is inserted
 * anywhere in the chain under test.
 */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  clipboardSync.reset();
  stubSelection("");
});

afterEach(() => {
  clipboardSync.stop();
  clipboardSync.reset();
  desktopClipboard.reset();
});

describe("clipboardSync selection push", () => {
  test("a copy inside the page reaches the desktop", () => {
    const target = fakeTarget();
    desktopClipboard.connect(target);
    clipboardSync.start();
    stubSelection("Team Aurora owns every Namespace");

    window.dispatchEvent(new Event("copy"));

    expect(target.pasted).toEqual(["Team Aurora owns every Namespace"]);
  });

  test("a cut is treated the same as a copy", () => {
    const target = fakeTarget();
    desktopClipboard.connect(target);
    clipboardSync.start();
    stubSelection("staging-quota");

    window.dispatchEvent(new Event("cut"));

    expect(target.pasted).toEqual(["staging-quota"]);
  });

  test("an empty selection pushes nothing", () => {
    const target = fakeTarget();
    desktopClipboard.connect(target);
    clipboardSync.start();

    window.dispatchEvent(new Event("copy"));

    expect(target.pasted).toEqual([]);
  });

  test("the same value is not pushed twice", () => {
    const target = fakeTarget();
    desktopClipboard.connect(target);
    clipboardSync.start();
    stubSelection("aurora-staging");

    window.dispatchEvent(new Event("copy"));
    window.dispatchEvent(new Event("copy"));

    expect(target.pasted).toEqual(["aurora-staging"]);
  });

  test("stop removes the listeners", () => {
    const target = fakeTarget();
    desktopClipboard.connect(target);
    clipboardSync.start();
    clipboardSync.stop();
    stubSelection("team=aurora");

    window.dispatchEvent(new Event("copy"));

    expect(target.pasted).toEqual([]);
  });
});

describe("clipboardSync host read", () => {
  test("focus pushes what another app put on the host clipboard", async () => {
    const target = fakeTarget();
    desktopClipboard.connect(target);
    stubClipboard({ readText: vi.fn(async () => "kubectl get pods -A") });

    expect(await clipboardSync.syncFromHost()).toBe(true);
    expect(target.pasted).toEqual(["kubectl get pods -A"]);
  });

  test("an unchanged host clipboard is not pushed again", async () => {
    const target = fakeTarget();
    desktopClipboard.connect(target);
    stubClipboard({ readText: vi.fn(async () => "aurora-staging") });

    await clipboardSync.syncFromHost();
    await clipboardSync.syncFromHost();

    expect(target.pasted).toEqual(["aurora-staging"]);
  });

  test("a refused read is silent", async () => {
    const target = fakeTarget();
    desktopClipboard.connect(target);
    stubClipboard({ readText: vi.fn(async () => Promise.reject(new Error("denied"))) });

    expect(await clipboardSync.syncFromHost()).toBe(false);
    expect(target.pasted).toEqual([]);
  });

  test("a browser with no readText at all is silent", async () => {
    const target = fakeTarget();
    desktopClipboard.connect(target);
    stubClipboard({}); // Firefox: no readText for web content

    expect(await clipboardSync.syncFromHost()).toBe(false);
    expect(target.pasted).toEqual([]);
  });

  test("start wires focus to a host read", async () => {
    const target = fakeTarget();
    desktopClipboard.connect(target);
    // Different values for the mount-time read and the focus-triggered read:
    // if the two reads returned the same text, the dedup guard in
    // pushToDesktop would make the second read a no-op even with the focus
    // listener deleted, and the test would pass either way.
    let hostText = "5 Pods";
    stubClipboard({ readText: vi.fn(async () => hostText) });
    clipboardSync.start();
    // Condition-based, not tick-counted: onFocus now runs syncToHost()
    // ahead of syncFromHost(), so the number of microtask hops before this
    // settles is an implementation detail, not a contract.
    await vi.waitFor(() => expect(target.pasted).toEqual(["5 Pods"])); // the mount-time read

    hostText = "3 Deployments";
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(target.pasted).toEqual(["5 Pods", "3 Deployments"]));
  });

  test("start wires visibilitychange to a host read", async () => {
    const target = fakeTarget();
    desktopClipboard.connect(target);
    let hostText = "5 Pods";
    stubClipboard({ readText: vi.fn(async () => hostText) });
    clipboardSync.start();
    await vi.waitFor(() => expect(target.pasted).toEqual(["5 Pods"])); // the mount-time read

    hostText = "3 Deployments";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(target.pasted).toEqual(["5 Pods", "3 Deployments"]));
  });

  test("stop removes the focus and visibilitychange listeners", async () => {
    const target = fakeTarget();
    desktopClipboard.connect(target);
    let hostText = "5 Pods";
    stubClipboard({ readText: vi.fn(async () => hostText) });
    clipboardSync.start();
    await vi.waitFor(() => expect(target.pasted).toEqual(["5 Pods"])); // the mount-time read

    clipboardSync.stop();
    hostText = "3 Deployments"; // a value distinct from lastSynced, so a
    // stray read would not be caught by the dedup guard
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    // Proving absence can't use vi.waitFor (it resolves the instant the
    // assertion is true, which is immediately if nothing is wired — that
    // would pass just as happily if the listener removal were broken and
    // the push simply hadn't landed yet). A macrotask flush instead drains
    // every microtask any surviving handler could have queued before this
    // assertion runs, whatever the chain length.
    await flushMicrotasks();

    expect(target.pasted).toEqual(["5 Pods"]);
  });
});

describe("clipboardSync host write", () => {
  test("what the desktop copied reaches the host clipboard", async () => {
    const writeText = vi.fn(async () => {});
    stubClipboard({ writeText });
    desktopClipboard.receive("candidate@instance-1");

    expect(await clipboardSync.syncToHost()).toBe(true);
    expect(writeText).toHaveBeenCalledWith("candidate@instance-1");
  });

  test("a refused write is silent", async () => {
    stubClipboard({ writeText: vi.fn(async () => Promise.reject(new Error("denied"))) });
    desktopClipboard.receive("nope");

    expect(await clipboardSync.syncToHost()).toBe(false);
  });

  test("a value taken from the desktop is never pushed back to it", async () => {
    // The loop this guards against: write X to the host, the next focus
    // reads X back, and pushes it to the desktop again, forever.
    const target = fakeTarget();
    desktopClipboard.connect(target);
    const writeText = vi.fn(async () => {});
    stubClipboard({ writeText, readText: vi.fn(async () => "orbit-frontend") });

    desktopClipboard.receive("orbit-frontend");
    await clipboardSync.syncToHost();
    const pushed = await clipboardSync.syncFromHost();

    expect(pushed).toBe(false);
    expect(target.pasted).toEqual([]);
  });

  test("a value pushed to the desktop is not written back to the host", async () => {
    const target = fakeTarget();
    desktopClipboard.connect(target);
    const writeText = vi.fn(async () => {});
    stubClipboard({ writeText, readText: vi.fn(async () => "lyra") });

    await clipboardSync.syncFromHost();
    desktopClipboard.receive("lyra"); // the server echoes it back

    expect(await clipboardSync.syncToHost()).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe("clipboardSync desktop-change wiring", () => {
  test("a desktop change while focused is written to the host", async () => {
    const hasFocusSpy = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    try {
      const writeText = vi.fn(async () => {});
      stubClipboard({ writeText });
      clipboardSync.start();

      desktopClipboard.receive("candidate@instance-2");

      await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("candidate@instance-2"));
    } finally {
      hasFocusSpy.mockRestore();
    }
  });

  test("a desktop change while unfocused waits for the next focus", async () => {
    const hasFocusSpy = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    try {
      const writeText = vi.fn(async () => {});
      stubClipboard({ writeText });
      clipboardSync.start();

      desktopClipboard.receive("candidate@instance-3");
      // The subscribe callback's hasFocus() guard runs synchronously inside
      // receive(); if it had passed, the write it triggers would already
      // be underway. No tick to wait out for this half of the claim.
      expect(writeText).not.toHaveBeenCalled();

      hasFocusSpy.mockReturnValue(true);
      window.dispatchEvent(new Event("focus"));

      // ...but nothing is lost: the focus handler tries syncToHost() on
      // return, independently of the subscription, and picks up the value
      // that arrived while the tab was elsewhere.
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("candidate@instance-3"));
    } finally {
      hasFocusSpy.mockRestore();
    }
  });

  test("stop unsubscribes from desktop clipboard changes", async () => {
    const hasFocusSpy = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    try {
      const writeText = vi.fn(async () => {});
      stubClipboard({ writeText });
      clipboardSync.start();
      clipboardSync.stop();

      desktopClipboard.receive("candidate@instance-4");
      // Were the subscription still live, hasFocus() would pass and
      // syncToHost() would call writeText synchronously as part of
      // handling receive() — so, as above, no tick to wait out. A
      // trailing flush still guards against a future implementation that
      // defers the call.
      await flushMicrotasks();

      expect(writeText).not.toHaveBeenCalled();
    } finally {
      hasFocusSpy.mockRestore();
    }
  });
});

describe("clipboardSync lifecycle", () => {
  test("start is idempotent, so a double-invoked effect pushes once", () => {
    const target = fakeTarget();
    desktopClipboard.connect(target);
    stubClipboard({});
    clipboardSync.start();
    clipboardSync.start();
    stubSelection("cygnus");

    window.dispatchEvent(new Event("copy"));

    expect(target.pasted).toEqual(["cygnus"]);
  });

  test("stop then start re-arms the listeners", () => {
    const target = fakeTarget();
    desktopClipboard.connect(target);
    stubClipboard({});
    clipboardSync.start();
    clipboardSync.stop();
    clipboardSync.start();
    stubSelection("helios");

    window.dispatchEvent(new Event("copy"));

    expect(target.pasted).toEqual(["helios"]);
  });
});
