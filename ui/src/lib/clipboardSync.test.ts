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
    stubClipboard({});

    expect(await clipboardSync.syncFromHost()).toBe(false);
    expect(target.pasted).toEqual([]);
  });

  test("start wires focus to a host read", async () => {
    const target = fakeTarget();
    desktopClipboard.connect(target);

    let hostText = "5 Pods";
    stubClipboard({ readText: vi.fn(async () => hostText) });
    clipboardSync.start();

    await vi.waitFor(() => expect(target.pasted).toEqual(["5 Pods"]));

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
    await vi.waitFor(() => expect(target.pasted).toEqual(["5 Pods"]));

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
    await vi.waitFor(() => expect(target.pasted).toEqual(["5 Pods"]));

    clipboardSync.stop();
    hostText = "3 Deployments";

    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));

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
    desktopClipboard.receive("lyra");

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

      expect(writeText).not.toHaveBeenCalled();

      hasFocusSpy.mockReturnValue(true);
      window.dispatchEvent(new Event("focus"));

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

      await flushMicrotasks();

      expect(writeText).not.toHaveBeenCalled();
    } finally {
      hasFocusSpy.mockRestore();
    }
  });
});

describe("clipboardSync loop-guard edge cases", () => {
  test("a page copy between a desktop push and the next focus does not re-send stale desktop text and blocks the real host change", async () => {
    const target = fakeTarget();
    desktopClipboard.connect(target);
    const hasFocusSpy = vi.spyOn(document, "hasFocus").mockReturnValue(true);

    let hostClipboard = "";
    const writeText = vi.fn(async (text: string) => {
      hostClipboard = text;
    });
    const readText = vi.fn(async () => hostClipboard);
    stubClipboard({ writeText, readText });

    try {
      clipboardSync.start();

      desktopClipboard.receive("pod-A");
      await vi.waitFor(() => expect(hostClipboard).toBe("pod-A"));

      stubSelection("value-C");
      window.dispatchEvent(new Event("copy"));
      expect(target.pasted).toContain("value-C");

      hostClipboard = "manifest-D";
      window.dispatchEvent(new Event("focus"));

      await vi.waitFor(() => expect(target.pasted).toContain("manifest-D"));
      expect(hostClipboard).toBe("manifest-D");
    } finally {
      hasFocusSpy.mockRestore();
    }
  });
});

describe("clipboardSync stop/start lifecycle clears sync state", () => {
  test("stop then start pushes an unchanged host clipboard again, as a fresh desktop container needs", async () => {
    const target = fakeTarget();
    desktopClipboard.connect(target);
    stubClipboard({ readText: vi.fn(async () => "aurora-staging") });

    clipboardSync.start();
    await vi.waitFor(() => expect(target.pasted).toEqual(["aurora-staging"]));

    clipboardSync.stop();

    const target2 = fakeTarget();
    desktopClipboard.connect(target2);
    clipboardSync.start();

    await vi.waitFor(() => expect(target2.pasted).toEqual(["aurora-staging"]));
  });
});

describe("clipboardSync pushToDesktop failure path", () => {
  test("a push with no desktop connected leaves the guard unset, so the same text retries successfully once connected", () => {
    stubClipboard({});
    clipboardSync.start();
    stubSelection("kube-system");

    window.dispatchEvent(new Event("copy"));

    const target = fakeTarget();
    desktopClipboard.connect(target);
    window.dispatchEvent(new Event("copy"));

    expect(target.pasted).toEqual(["kube-system"]);
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
