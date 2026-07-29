import { afterEach, beforeEach, describe, expect, test } from "vitest";
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
