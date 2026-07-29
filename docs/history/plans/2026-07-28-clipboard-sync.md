# Clipboard Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror the host clipboard and the exam desktop's clipboard in both directions automatically, so anything highlighted and copied can be pasted in the remote desktop with ⌘V/Ctrl+V, Ctrl+Shift+V, or right-click → Paste.

**Architecture:** One new module singleton, `ui/src/lib/clipboardSync.ts`, owns the window-level `copy`/`cut`/`focus`/`visibilitychange` listeners and delegates transport to the existing `desktopClipboard`. A single `lastSynced` string prevents the two directions from ping-ponging. Separately, `desktopKeymap`'s shifted chords are corrected to send uppercase X11 keysyms.

**Tech Stack:** TypeScript, React 18, Vitest 2, jsdom, @novnc/novnc 1.7.

Spec: [`../specs/2026-07-28-clipboard-sync-design.md`](../specs/2026-07-28-clipboard-sync-design.md)

## Global Constraints

- Work in `ui/`. All commands below run from `ui/` unless stated otherwise.
- Full gate before pushing: `npx tsc --noEmit && npm run lint && npm test`.
- **vitest is pinned to v2** for compatibility with vite 5. Do not bump it.
- `npm run lint` has one pre-existing warning (a deliberate mount-only effect). One warning is the expected baseline; do not "fix" it.
- Do not deep-import `@novnc/novnc` subpaths. Its `exports` field is the single string `./core/rfb.js`, so every subpath is unresolvable and fails at build time. X11 keysyms stay in the local `XK` table.
- Follow the existing module-singleton shape (`desktopClipboard`, `desktopKeymap`, `desktopResize`): a class with a `reset()` for tests, exported as a lowercase const instance.
- Every commit message ends with these two trailers, separated from the subject by a blank line:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P6kgExw1VAyDeovNuvb1KL
```

---

### Task 1: Correct the shifted chord keysyms

The bug that started this: `sendPasteChord()` sends keysym `0x0076` (lowercase `v`) while holding `Shift_L`. Holding Shift while naming an unshifted keysym is an inconsistent pair; xfce4-terminal's Ctrl+Shift+V accelerator does not match it and the terminal forwards a plain Ctrl+V to the application, which renders as `^` in vim. Every chord with `shift: true` shares the defect.

**Files:**
- Modify: `ui/src/lib/desktopKeymap.ts:35-49` (the `XK` table), `:74-75`, `:98-99`, `:275`
- Test: `ui/src/lib/desktopKeymap.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: no signature changes. `desktopKeymap.sendPasteChord(): void` and `desktopKeymap.attach(target: KeyTarget): void` keep their current shapes.

- [ ] **Step 1: Write the failing test**

Append inside the existing top-level `describe("desktopKeymap", ...)` block in `ui/src/lib/desktopKeymap.test.ts`:

```ts
  test("a shifted chord sends the uppercase keysym", () => {
    // X11 derives the character from keycode + modifier state. Naming the
    // lowercase keysym while holding Shift is inconsistent, and GTK's
    // Ctrl+Shift+V accelerator does not match it — the terminal then
    // forwards a bare Ctrl+V, which is readline's verbatim-insert prefix.
    const { target, sent } = fakeTarget();
    desktopKeymap.attach(target);

    desktopKeymap.sendPasteChord();

    expect(sent).toContainEqual([0x0056, "KeyV", true]);
    expect(sent).not.toContainEqual([0x0076, "KeyV", true]);
  });

  test("every shifted chord in the map uses an uppercase keysym", () => {
    const { target, sent } = fakeTarget();
    desktopKeymap.setReservedEnabled(true);
    desktopKeymap.attach(target);

    // ⌘C -> Ctrl+Shift+C, ⌘T -> Ctrl+Shift+T, ⌘W -> Ctrl+Shift+W.
    for (const key of ["c", "t", "w"]) {
      desktopKeymap.handleKeyDown(keydown(key, { metaKey: true }));
    }

    // Down-only: send() taps each key down then up, so every keysym
    // appears twice.
    const letters = sent.filter(([ks, , down]) => down && ks >= 0x0041 && ks <= 0x007a);
    expect(letters.map(([ks]) => ks)).toEqual([0x0043, 0x0054, 0x0057]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/desktopKeymap.test.ts -t "uppercase keysym"`

Expected: FAIL. The first test reports the array contains `[118, "KeyV", true]` (`0x0076`) and not `[86, ...]`.

- [ ] **Step 3: Write minimal implementation**

In `ui/src/lib/desktopKeymap.ts`, add the four uppercase entries to the `XK` table. Keep the existing lowercase entries — `meta+k` maps to Ctrl+L and `alt+arrow*` to Alt+B/Alt+F, none of which hold Shift:

```ts
const XK = {
  Control_L: 0xffe3,
  Shift_L: 0xffe1,
  Alt_L: 0xffe9,
  Home: 0xff50,
  End: 0xff57,
  b: 0x0062,
  c: 0x0063,
  f: 0x0066,
  l: 0x006c,
  t: 0x0074,
  u: 0x0075,
  v: 0x0076,
  w: 0x0077,
  // Shifted forms. A chord that holds Shift must name the shifted keysym:
  // X11 derives the character from keycode + modifier state, so Shift plus
  // a lowercase keysym is an inconsistent pair that GTK accelerators
  // (Ctrl+Shift+V and friends) will not match.
  C: 0x0043,
  T: 0x0054,
  V: 0x0056,
  W: 0x0057,
} as const;
```

Then point every `shift: true` chord at the shifted keysym. Line 74-75:

```ts
  "meta+c": { keysym: XK.C, code: "KeyC", ctrl: true, shift: true, describes: "Copy" },
  "meta+v": { keysym: XK.V, code: "KeyV", ctrl: true, shift: true, describes: "Paste" },
```

Line 98-99:

```ts
  "meta+t": { keysym: XK.T, code: "KeyT", ctrl: true, shift: true, describes: "New terminal tab" },
  "meta+w": { keysym: XK.W, code: "KeyW", ctrl: true, shift: true, describes: "Close terminal tab" },
```

And `sendPasteChord` at line 275:

```ts
  sendPasteChord(): void {
    this.send({ keysym: XK.V, code: "KeyV", ctrl: true, shift: true, describes: "Paste" });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/desktopKeymap.test.ts`

Expected: PASS, including the pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/desktopKeymap.ts src/lib/desktopKeymap.test.ts
git commit -m "fix: shifted chords must name the shifted keysym"
```

---

### Task 2: clipboardSync module — push the page selection to the desktop

The permission-free half. A `copy` or `cut` raised inside the page carries a live DOM selection, so the text can be read directly with no clipboard API and no prompt. This is what makes highlighting question 1 and pressing ⌘C work in every browser.

**Files:**
- Create: `ui/src/lib/clipboardSync.ts`
- Test: `ui/src/lib/clipboardSync.test.ts`

**Interfaces:**
- Consumes: `desktopClipboard.sendToDesktop(text: string): boolean` and `desktopClipboard.connect(target: ClipboardTarget): void` from `./desktopClipboard`.
- Produces: `clipboardSync`, a singleton with `start(): void`, `stop(): void`, `reset(): void`, and `syncFromSelection(): boolean`. Later tasks add `syncFromHost()` and `syncToHost()` to the same class.

- [ ] **Step 1: Write the failing test**

Create `ui/src/lib/clipboardSync.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/clipboardSync.test.ts`

Expected: FAIL — `Failed to resolve import "./clipboardSync"`.

- [ ] **Step 3: Write minimal implementation**

Create `ui/src/lib/clipboardSync.ts`:

```ts
// Keeps the host clipboard and the exam desktop's clipboard in step.
//
// Before this existed, the desktop's clipboard was written only by an
// explicit click on a copy control in the question panel. A candidate who
// highlighted prose and pressed ⌘C — or copied a manifest out of an
// editor — had no way to get it across: the value reached the host
// clipboard and stopped there.
//
// Two triggers, deliberately different in what they cost. A copy raised
// inside the page carries a live DOM selection, so it needs no clipboard
// permission in any browser. Reading what another application put on the
// host clipboard needs navigator.clipboard.readText, which Firefox does
// not expose to web content at all — that half degrades to the Clipboard
// panel rather than failing loudly.
//
// Module-singleton shape, following desktopClipboard and desktopKeymap:
// the Exam screen starts it, and nothing else needs to know it exists.

import { desktopClipboard } from "./desktopClipboard";

/**
 * Longest value worth mirroring.
 *
 * Xvnc is started with -MaxCutText 2097152, so this is far below what the
 * transport accepts. The limit exists to stop a candidate who selected an
 * entire scrollback from pushing megabytes across the socket on every
 * keystroke of a chord.
 */
const MAX_SYNC_CHARS = 100_000;

class ClipboardSync {
  /**
   * The last value moved in either direction.
   *
   * The whole reason both directions can be automatic. Without it the two
   * ping-pong: the page writes X to the host, the next focus reads X back,
   * and pushes it to the desktop again. A value that arrived from one side
   * is never sent back to it.
   */
  private lastSynced = "";
  private stopFns: Array<() => void> = [];

  start(): void {
    if (this.stopFns.length) return; // idempotent: effects can run twice
    const onCopy = () => void this.syncFromSelection();
    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCopy);
    this.stopFns.push(() => {
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("cut", onCopy);
    });
  }

  stop(): void {
    for (const fn of this.stopFns) fn();
    this.stopFns = [];
  }

  /**
   * Pushes the current DOM selection to the desktop.
   *
   * Returns whether anything was sent, which is what the tests assert on.
   */
  syncFromSelection(): boolean {
    return this.pushToDesktop(window.getSelection()?.toString() ?? "");
  }

  /** Sends to the desktop unless it is empty, oversized, or already there. */
  private pushToDesktop(text: string): boolean {
    if (!text || text === this.lastSynced) return false;
    if (text.length > MAX_SYNC_CHARS) return false;
    if (!desktopClipboard.sendToDesktop(text)) return false;
    this.lastSynced = text;
    return true;
  }

  /** Test-only, mirroring desktopKeymap.reset. */
  reset(): void {
    this.stop();
    this.lastSynced = "";
  }
}

export const clipboardSync = new ClipboardSync();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/clipboardSync.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clipboardSync.ts src/lib/clipboardSync.test.ts
git commit -m "feat: mirror the page selection into the desktop clipboard"
```

---

### Task 3: Read the host clipboard on focus

Covers text copied in another application. `readText()` needs the `clipboard-read` permission and a focused document; when it is refused this is a silent no-op, because it runs on every tab focus and a toast there would be noise rather than information.

**Files:**
- Modify: `ui/src/lib/clipboardSync.ts`
- Test: `ui/src/lib/clipboardSync.test.ts`

**Interfaces:**
- Consumes: `clipboardSync.start()`, `clipboardSync.reset()` and the private `pushToDesktop` from Task 2.
- Produces: `clipboardSync.syncFromHost(): Promise<boolean>` — resolves true when a value was pushed to the desktop.

- [ ] **Step 1: Write the failing test**

Add to `ui/src/lib/clipboardSync.test.ts`. Also add `vi` to the existing vitest import at the top of the file:

```ts
function stubClipboard(clipboard: Partial<Clipboard>) {
  Object.defineProperty(navigator, "clipboard", {
    value: clipboard,
    configurable: true,
  });
}

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
    stubClipboard({ readText: vi.fn(async () => "5 Pods") });
    clipboardSync.start();

    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
    await Promise.resolve();

    expect(target.pasted).toEqual(["5 Pods"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/clipboardSync.test.ts -t "host read"`

Expected: FAIL — `clipboardSync.syncFromHost is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `ui/src/lib/clipboardSync.ts`, add the method to the class:

```ts
  /**
   * Reads the host clipboard and pushes it to the desktop.
   *
   * Silent on refusal by design: Firefox has no readText for web content,
   * and Chrome needs a granted permission. This runs on every tab focus,
   * so a warning here would fire constantly for a large share of users.
   * The Clipboard panel is the path that always works, and its copy
   * already says so.
   */
  async syncFromHost(): Promise<boolean> {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return false;
    }
    return this.pushToDesktop(text);
  }
```

Then extend `start()` to wire focus. Replace the body with:

```ts
  start(): void {
    if (this.stopFns.length) return; // idempotent: effects can run twice
    const onCopy = () => void this.syncFromSelection();
    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCopy);
    this.stopFns.push(() => {
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("cut", onCopy);
    });

    // Returning to the tab is the moment a candidate has just copied
    // something elsewhere. visibilitychange covers tab switches;
    // focus covers switching between windows of the same tab.
    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      void this.syncFromHost();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    this.stopFns.push(() => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    });

    void this.syncFromHost();
  }
```

Note `navigator.clipboard` may be `undefined` in an insecure context; the property access throws a `TypeError`, which the same `catch` absorbs.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/clipboardSync.test.ts`

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clipboardSync.ts src/lib/clipboardSync.test.ts
git commit -m "feat: mirror the host clipboard to the desktop on focus"
```

---

### Task 4: Write the desktop's clipboard back to the host

The reverse direction. `desktopClipboard.receive()` already fires on every remote clipboard change and currently only parks the text for the panel. Chrome grants `clipboard-write` to the focused tab, so this needs no gesture; Firefox refuses and the panel's button remains.

**Files:**
- Modify: `ui/src/lib/clipboardSync.ts`
- Test: `ui/src/lib/clipboardSync.test.ts`

**Interfaces:**
- Consumes: `desktopClipboard.subscribe(listener: () => void): () => void`, `desktopClipboard.getRemote(): string`, `desktopClipboard.receive(text: string): void`.
- Produces: `clipboardSync.syncToHost(): Promise<boolean>` — resolves true when the host clipboard was written.

- [ ] **Step 1: Write the failing test**

Add to `ui/src/lib/clipboardSync.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/clipboardSync.test.ts -t "host write"`

Expected: FAIL — `clipboardSync.syncToHost is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add the method to the class in `ui/src/lib/clipboardSync.ts`:

```ts
  /**
   * Writes the desktop's clipboard to the host.
   *
   * Chrome grants clipboard-write to the focused tab, so no gesture is
   * needed. Firefox refuses without one — the Clipboard panel's button is
   * a real gesture and stays for exactly that case.
   */
  async syncToHost(): Promise<boolean> {
    const text = desktopClipboard.getRemote();
    if (!text || text === this.lastSynced) return false;
    if (text.length > MAX_SYNC_CHARS) return false;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return false;
    }
    this.lastSynced = text;
    return true;
  }
```

Then subscribe to remote changes inside `start()`, immediately before the trailing `void this.syncFromHost();`:

```ts
    // The desktop pushes its clipboard on every explicit copy there.
    // Writing needs a focused document, so a change that arrives while the
    // candidate is looking elsewhere is picked up by the focus handler.
    const unsubscribe = desktopClipboard.subscribe(() => {
      if (!document.hasFocus()) return;
      void this.syncToHost();
    });
    this.stopFns.push(unsubscribe);
```

And extend `onFocus` so returning to the tab settles both directions. Replace it with:

```ts
    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      void this.syncToHost().then((written) => {
        if (!written) void this.syncFromHost();
      });
    };
```

The desktop wins a genuine tie: if both sides changed while the tab was hidden there is no way to know which is newer, and the remote value is the one the candidate produced by hand.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/clipboardSync.test.ts`

Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clipboardSync.ts src/lib/clipboardSync.test.ts
git commit -m "feat: write the desktop clipboard back to the host"
```

---

### Task 5: Start the sync from the Exam screen

**Files:**
- Modify: `ui/src/screens/Exam.tsx` (add an effect beside the existing `?`-key effect at `:169-182`)
- Test: `ui/src/lib/clipboardSync.test.ts`

**Interfaces:**
- Consumes: `clipboardSync.start()` / `clipboardSync.stop()` from Tasks 2-4.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

React StrictMode double-invokes effects in development, so a second `start()` must not register a second set of listeners. Add to `ui/src/lib/clipboardSync.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/clipboardSync.test.ts -t "lifecycle"`

Expected: The first test FAILS with `["cygnus", "cygnus"]` if `start()` is not guarded. If Task 2's guard is already in place both PASS — that is fine, they are the regression tests for it. Proceed to Step 3 either way.

- [ ] **Step 3: Write minimal implementation**

In `ui/src/screens/Exam.tsx`, add the import beside the existing `desktopKeymap` import at line 13:

```ts
import { clipboardSync } from "../lib/clipboardSync";
```

Then add this effect immediately after the `?`-key effect that ends at line 182:

```tsx
  // Clipboard mirroring runs for as long as the exam view is mounted, not
  // for as long as a viewport is connected: a candidate copies things
  // before the desktop finishes connecting, and the sync is a no-op until
  // there is somewhere to send them.
  useEffect(() => {
    clipboardSync.start();
    return () => clipboardSync.stop();
  }, []);
```

- [ ] **Step 4: Run the full gate**

Run: `npx tsc --noEmit && npm run lint && npm test`

Expected: types clean, lint reports exactly one pre-existing warning, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Exam.tsx src/lib/clipboardSync.test.ts
git commit -m "feat: run clipboard sync for the life of the exam view"
```

---

### Task 6: Correct the README and verify in a real browser

The README still documents the pre-`pasteChordLabel()` behaviour and contradicts the code. And the whole reason this bug shipped is that `navigator.clipboard` is stubbed in every test — the suite cannot catch a malformed keysym.

**Files:**
- Modify: `README.md:61-65`

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: nothing.

- [ ] **Step 1: Rewrite the README paragraph**

Replace lines 61-65 of `README.md`:

```markdown
Anything you copy reaches the exam desktop automatically — highlight text
in a question and press ⌘C, or copy from any other app and come back to
the tab. Paste in the exam terminal with Ctrl+V, ⌘V, the terminal's own
Ctrl+Shift+V, or right-click → Paste. Copying in the terminal works the
same way in reverse. Press `?` for the full shortcut list. Firefox cannot
hand this page your clipboard, so there the Clipboard panel is the way
across.
```

- [ ] **Step 2: Run the full gate**

From `ui/`: `npx tsc --noEmit && npm run lint && npm test`

From the repo root: `tests/check-lint.sh`

Expected: all pass. `check-lint.sh` grades spelling and prose in Markdown, so a typo here fails the build.

- [ ] **Step 3: Verify in Chrome against a running stack**

Bring the stack up (`./sim up`) and start an exam. Confirm each of these by hand — no test in this repo can:

1. Highlight the body text of question 1 with the mouse, press ⌘C. In the terminal, right-click → **Paste**. The full multi-line text appears.
2. With the same text copied, press **⌘V** over the desktop. It pastes. It must **not** print `^` — that is the verbatim-insert prefix and means the chord regressed.
3. Press **Ctrl+V**. Same result as ⌘V.
4. Copy something in a different application, switch back to the tab, paste in the terminal. It arrives.
5. In the terminal, select text and press Ctrl+Shift+C, then paste into a host application. It arrives.
6. Paste a multi-line block into `vim`. Expect autoindent to staircase it unless bracketed paste handles it — if it staircases, that is a vim/terminal concern, not a clipboard one. Note the result, do not fix it here.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: the clipboard is synced now, so say that"
```

---

## Self-Review

**Spec coverage.** Dedicated `clipboardSync` module — Task 2. Copy/cut trigger — Task 2. Focus/visibilitychange trigger plus one read on start — Task 3. Desktop→host on focus — Task 4. `lastSynced` loop guard — Tasks 2-4, asserted directly in Task 4. Shifted keysyms and the ⌘C/⌘T/⌘W repair — Task 1. ⌘V keeping its fresh read-push-chord sequence — no change needed; `DesktopViewport.tsx:170-183` already does exactly that and Task 1 fixes the chord it sends. Browser check as part of done — Task 6. "Deliberately not done" items — no tasks, correctly.

**Placeholder scan.** No TBDs. Every code step carries the literal code. Task 6's step 3 is a manual checklist with concrete pass/fail criteria rather than "verify it works".

**Type consistency.** `sendToDesktop`, `getRemote`, `subscribe`, `receive`, `connect` and `reset` all match `desktopClipboard`'s existing signatures. `syncFromSelection(): boolean` is sync; `syncFromHost()` and `syncToHost()` both return `Promise<boolean>` and are used as such in Task 4's `onFocus`. `MAX_SYNC_CHARS` is defined once in Task 2 and reused in Task 4.

One note carried forward for the executor: Task 5's first test may pass immediately, because Task 2's implementation already includes the idempotence guard. That is intentional — the test is the regression lock, not a discovery.
