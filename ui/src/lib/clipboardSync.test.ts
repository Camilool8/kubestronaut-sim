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
    await Promise.resolve();
    await Promise.resolve();
    expect(target.pasted).toEqual(["5 Pods"]); // the mount-time read

    hostText = "3 Deployments";
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
    await Promise.resolve();

    expect(target.pasted).toEqual(["5 Pods", "3 Deployments"]);
  });

  test("start wires visibilitychange to a host read", async () => {
    const target = fakeTarget();
    desktopClipboard.connect(target);
    let hostText = "5 Pods";
    stubClipboard({ readText: vi.fn(async () => hostText) });
    clipboardSync.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(target.pasted).toEqual(["5 Pods"]); // the mount-time read

    hostText = "3 Deployments";
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    await Promise.resolve();

    expect(target.pasted).toEqual(["5 Pods", "3 Deployments"]);
  });

  test("stop removes the focus and visibilitychange listeners", async () => {
    const target = fakeTarget();
    desktopClipboard.connect(target);
    let hostText = "5 Pods";
    stubClipboard({ readText: vi.fn(async () => hostText) });
    clipboardSync.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(target.pasted).toEqual(["5 Pods"]); // the mount-time read

    clipboardSync.stop();
    hostText = "3 Deployments"; // a value distinct from lastSynced, so a
    // stray read would not be caught by the dedup guard
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    await Promise.resolve();

    expect(target.pasted).toEqual(["5 Pods"]);
  });
});
