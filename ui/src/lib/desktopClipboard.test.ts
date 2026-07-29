import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { desktopClipboard, toAsciiForDesktop, type ClipboardTarget } from "./desktopClipboard";

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

describe("pasteFromHost", () => {
  // The one-keystroke path: read the host clipboard, push it into the
  // remote clipboard, then synthesise the terminal's paste chord. The
  // ORDER matters — both messages go out on the same socket, so the
  // server must see the cut-text before the key event.
  test("pushes the host clipboard to the desktop, then sends the chord", async () => {
    const order: string[] = [];
    const target = {
      clipboardPasteFrom: (t: string) => {
        order.push(`paste:${t}`);
      },
    };
    desktopClipboard.connect(target);
    vi.stubGlobal("navigator", {
      clipboard: { readText: async () => "kubectl get pods" },
    });

    const outcome = await desktopClipboard.pasteFromHost(() => order.push("chord"));

    expect(outcome).toBe("sent");
    expect(order).toEqual(["paste:kubectl get pods", "chord"]);
  });

  // Firefox has no readText for web content; Chrome refuses without the
  // permission. This is an expected path for a lot of users, and the
  // caller turns it into a pointer at the clipboard panel.
  test("reports blocked when the browser refuses to read the clipboard", async () => {
    let chords = 0;
    desktopClipboard.connect({ clipboardPasteFrom: () => {} });
    vi.stubGlobal("navigator", {
      clipboard: {
        readText: async () => {
          throw new Error("NotAllowedError");
        },
      },
    });

    expect(await desktopClipboard.pasteFromHost(() => chords++)).toBe("blocked");
    expect(chords).toBe(0);
  });

  // Sending the chord anyway would paste whatever was in the remote
  // clipboard before, which is worse than doing nothing.
  test("does not send the chord when there is no desktop", async () => {
    let chords = 0;
    desktopClipboard.reset();
    vi.stubGlobal("navigator", { clipboard: { readText: async () => "text" } });

    expect(await desktopClipboard.pasteFromHost(() => chords++)).toBe("no-desktop");
    expect(chords).toBe(0);
  });

  test("reports empty rather than pasting nothing", async () => {
    let chords = 0;
    desktopClipboard.connect({ clipboardPasteFrom: () => {} });
    vi.stubGlobal("navigator", { clipboard: { readText: async () => "" } });

    expect(await desktopClipboard.pasteFromHost(() => chords++)).toBe("empty");
    expect(chords).toBe(0);
  });
});

describe("inbound clipboard", () => {
  // Previously this text was handed straight to navigator.clipboard
  // .writeText, which needs a user gesture the WebSocket message cannot
  // provide — so it was usually refused and silently dropped. Holding it
  // lets the panel offer a button, which is a real gesture.
  test("keeps what the desktop copied and notifies subscribers", () => {
    desktopClipboard.reset();
    let notified = 0;
    const unsubscribe = desktopClipboard.subscribe(() => notified++);

    desktopClipboard.receive("nginx:1.29-alpine");
    expect(desktopClipboard.getRemote()).toBe("nginx:1.29-alpine");
    expect(notified).toBe(1);

    // Identical text is not a change — otherwise every repeated copy
    // would re-render the panel for nothing.
    desktopClipboard.receive("nginx:1.29-alpine");
    expect(notified).toBe(1);

    unsubscribe();
  });
});

describe("toAsciiForDesktop", () => {
  test("leaves ASCII untouched", () => {
    expect(toAsciiForDesktop("kubectl get pods -A")).toBe("kubectl get pods -A");
  });

  test("transliterates the typography the banks actually use", () => {
    expect(toAsciiForDesktop("a—b")).toBe("a-b");
    expect(toAsciiForDesktop("a–b")).toBe("a-b");
    expect(toAsciiForDesktop("‘x’")).toBe("'x'");
    expect(toAsciiForDesktop("“x”")).toBe('"x"');
    expect(toAsciiForDesktop("a…")).toBe("a...");
    // Explicit escape, not a literal nbsp glyph: the two are visually
    // identical in source, which is exactly how the table bug shipped.
    expect(toAsciiForDesktop("a\u00a0b")).toBe("a b");
    // A plain ASCII space stays untouched, kept alongside the nbsp
    // case above so the two are visibly distinct in the source.
    expect(toAsciiForDesktop("a b")).toBe("a b");
  });

  test("replaces anything else non-ASCII rather than dropping it", () => {
    // Whatever we cannot represent must still be visible as a gap.
    expect(toAsciiForDesktop("a中b")).toBe("a?b");
    expect(toAsciiForDesktop("aéb")).toBe("a?b");
  });

  test("preserves newlines and tabs", () => {
    expect(toAsciiForDesktop("one\ntwo\tthree")).toBe("one\ntwo\tthree");
  });

  test("handles astral characters as a single replacement", () => {
    // Iterating by code point, not code unit, so a surrogate pair is one "?".
    expect(toAsciiForDesktop("a\u{1F600}b")).toBe("a?b");
  });
});

describe("desktopClipboard sanitises every push", () => {
  test("copy() sends ASCII to the desktop but the original to the browser", async () => {
    const writeText = stubBrowserClipboard();
    const target = fakeTarget();
    desktopClipboard.connect(target);

    expect(await desktopClipboard.copy("aurora — staging")).toBe("desktop");
    expect(target.pasted).toEqual(["aurora - staging"]);
    expect(writeText).toHaveBeenCalledWith("aurora — staging");
  });

  test("sendToDesktop() sanitises", () => {
    const target = fakeTarget();
    desktopClipboard.connect(target);

    expect(desktopClipboard.sendToDesktop("a — b")).toBe(true);
    expect(target.pasted).toEqual(["a - b"]);
  });

  test("pasteFromHost() sanitises before sending the chord", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: async () => "quota — 5 Pods", writeText: async () => {} },
      configurable: true,
    });
    const target = fakeTarget();
    desktopClipboard.connect(target);
    let chords = 0;

    expect(await desktopClipboard.pasteFromHost(() => chords++)).toBe("sent");
    expect(target.pasted).toEqual(["quota - 5 Pods"]);
    expect(chords).toBe(1);
  });
});
