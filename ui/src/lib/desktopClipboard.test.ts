import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { desktopClipboard, type ClipboardTarget } from "./desktopClipboard";

function fakeTarget(): ClipboardTarget & { pasted: string[] } {
  const pasted: string[] = [];
  return { pasted, clipboardPasteFrom: (text: string) => void pasted.push(text) };
}

function stubBrowserClipboard(writeText = vi.fn(async () => {})) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

beforeEach(() => {
  stubBrowserClipboard();
});

afterEach(() => {
  const target = fakeTarget();
  desktopClipboard.connect(target);
  desktopClipboard.disconnect(target);
});

describe("desktopClipboard", () => {
  test("with a desktop connected, a value reaches both clipboards", async () => {
    const writeText = stubBrowserClipboard();
    const target = fakeTarget();
    desktopClipboard.connect(target);

    expect(await desktopClipboard.copy("aurora-staging")).toBe("desktop");
    expect(target.pasted).toEqual(["aurora-staging"]);
    expect(writeText).toHaveBeenCalledWith("aurora-staging");
  });

  test("without a desktop, copying still works for the browser", async () => {
    const writeText = stubBrowserClipboard();
    expect(await desktopClipboard.copy("team=aurora")).toBe("browser");
    expect(writeText).toHaveBeenCalledWith("team=aurora");
  });

  test("a denied browser clipboard does not stop the desktop push", async () => {
    // The desktop is the one that matters: it is where the value gets typed.
    stubBrowserClipboard(vi.fn(async () => Promise.reject(new Error("denied"))));
    const target = fakeTarget();
    desktopClipboard.connect(target);

    expect(await desktopClipboard.copy("staging-quota")).toBe("desktop");
    expect(target.pasted).toEqual(["staging-quota"]);
  });

  test("reports failure when neither clipboard is reachable", async () => {
    stubBrowserClipboard(vi.fn(async () => Promise.reject(new Error("denied"))));
    expect(await desktopClipboard.copy("nope")).toBe("failed");
  });

  test("a stale viewport unmounting cannot unhook the live one", async () => {
    const old = fakeTarget();
    const current = fakeTarget();
    desktopClipboard.connect(old);
    desktopClipboard.connect(current);
    // The reconnect loop tears the old viewport down after the new one
    // has already registered.
    desktopClipboard.disconnect(old);

    expect(desktopClipboard.connected).toBe(true);
    await desktopClipboard.copy("/opt/course/1/aurora-namespaces");
    expect(current.pasted).toEqual(["/opt/course/1/aurora-namespaces"]);
    expect(old.pasted).toEqual([]);
  });

  test("a viewport that throws mid-copy degrades to the browser clipboard", async () => {
    const writeText = stubBrowserClipboard();
    desktopClipboard.connect({
      clipboardPasteFrom: () => {
        throw new Error("connection dropped");
      },
    });

    expect(await desktopClipboard.copy("nginx:1.29-alpine")).toBe("browser");
    expect(writeText).toHaveBeenCalledWith("nginx:1.29-alpine");
  });
});
