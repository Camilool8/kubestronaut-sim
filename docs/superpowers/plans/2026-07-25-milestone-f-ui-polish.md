# Milestone F — UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four reported defects whose shared cause is that failure and in-flight state render as absence, and remove the structural conditions that produced them.

**Architecture:** One `Markdown` component replaces two divergent markdown paths. One `useAsync` hook plus an `Async` boundary whose error branch is required by type replaces per-call-site async handling. A `progressStore` (modelled on the existing `toastStore`) drives a global top bar. Control failures become toasts; the skip link gets a hide that cannot leak.

**Tech Stack:** React 18, TypeScript 5.5, Vite 5, vitest 2 + @testing-library/react + vitest-axe, react-markdown 9, highlight.js 11 (new, lazy-loaded).

Spec: `docs/superpowers/specs/2026-07-25-milestone-f-ui-polish-design.md`
Branch: `milestone-f` (already created, off `main`)

## Global Constraints

Every task's requirements implicitly include this section.

- **Run all npm/vitest commands from `ui/`, never the repo root.** From the root, vitest misses `ui/vite.config.ts` and every DOM test fails with "document is not defined". The shell cwd can reset between commands — use `cd /Users/cjoga/Labs/kubestronaut-sim/ui` explicitly in each.
- **`ui/package-lock.json` must be regenerated inside `node:22-alpine`**, never with host npm — host npm resolves differently and breaks the image's `npm ci`.
- **Do not upgrade vitest past v2.** It is pinned for vite-5 compatibility.
- Per-task verification, all from `ui/`: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- **`npm run lint` has 3 pre-existing warnings in untouched files.** Do not regress past 3; do not "fix" them as drive-by work.
- The UI is compiled **into** the Go binary. Seeing a change in the running product requires `docker compose up -d --build facilitator` from the repo root. `ui/dist/` is gitignored; the committed placeholder is `facilitator/internal/web/dist/index.html`.
- **axe cannot check colour contrast** (jsdom has no layout engine). Any new colour pairing must have its ratio computed by hand and recorded as a comment in `ui/src/styles/tokens.css`.
- Design tokens have four mirrors outside `tokens.css` (the Go locked page `facilitator/internal/desktop/proxy.go`, `ui/public/favicon.svg`, `images/desktop/assets/terminalrc`, and its xfconf twin). **Only palette changes need those mirrors** — this milestone adds no palette colours, so no mirror edits are expected. If that changes, all four must be updated.
- **Check `GET /api/session` before triggering any reset or switch.** Both destroy a running attempt.
- **Never edit `ui/`, `facilitator/`, `proxy/`, `images/`, `banks/`, `tests/`, or `docker-compose.yaml` while `tests/smoke.sh` is running** — its warm-restart step rebuilds every image from the working tree.
- One commit per task, with all four verification commands green before committing.

## File Structure

**Created**
- `ui/src/components/progressStore.ts` — in-flight counter with show-delay/min-visible timing. No React.
- `ui/src/components/progressStore.test.ts`
- `ui/src/components/TopProgress.tsx` — subscribes to the store, renders the bar.
- `ui/src/components/Async.tsx` — render boundary with a required `error` branch.
- `ui/src/components/Async.test.tsx`
- `ui/src/components/Markdown.tsx` — the single markdown renderer (`CopyableCode` + `CodeBlock`).
- `ui/src/components/Markdown.test.tsx`
- `ui/src/lib/useAsync.ts` — the async hook.
- `ui/src/lib/useAsync.test.ts`
- `ui/src/lib/highlight.ts` — lazy highlight.js loader with a 3-language subset.
- `ui/src/components/ScreenTransition.tsx`

**Modified**
- `ui/src/App.tsx` — control-failure toasts; renders `TopProgress` and `ScreenTransition`.
- `ui/src/screens/Start.tsx` — catalog through `useAsync` + error card.
- `ui/src/screens/Score.tsx` — solutions through `Markdown`.
- `ui/src/components/QuestionPanel.tsx` — markdown moves out to `Markdown`.
- `ui/src/strings.ts` — new copy groups.
- `ui/src/theme.css` — skip-link hide, `.md` namespace, code-block chrome, progress bar, responsive score.
- `ui/package.json`, `ui/package-lock.json` — highlight.js.
- `README.md`, `docs/follow-ups.md` — milestone story and triage.

---

### Task 1: A skip-link hide that cannot leak

Fixes reported defect #2. Independent of everything else — do it first so the most visible bug is gone earliest.

**Files:**
- Modify: `ui/src/theme.css:1122-1139`

**Interfaces:**
- Consumes: nothing
- Produces: nothing (CSS only; `.skip-link` markup in `DesktopViewport.tsx:95` is unchanged)

- [ ] **Step 1: Read the current rule and confirm the defect**

Current (`ui/src/theme.css:1122-1139`):

```css
/* ---- skip link (keyboard exit past the VNC canvas) ---- */

.skip-link {
  position: absolute;
  top: var(--space-2);
  left: var(--space-2);
  z-index: var(--z-panel);
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: var(--radius-s);
  color: var(--accent);
  padding: var(--space-2) var(--space-3);
  transform: translateY(-200%);
}

.skip-link:focus {
  transform: none;
}
```

`translateY(-200%)` is travel proportional to the element's own height (41.25px → −82.5px). Its containing block `.desktop-viewport` starts 54.09px down the page, so the link lands at −20.41px and leaves 20.84px visible.

- [ ] **Step 2: Replace with the clip idiom already used by `.sr-only`**

Replace the whole block above with:

```css
/* ---- skip link (keyboard exit past the VNC canvas) ----
   Hidden with the same clip idiom as .sr-only (base.css), NOT with a
   transform: a translate is proportional to the element's own height, so
   whether it clears the viewport depends on how far down the page its
   container starts and whether the label wrapped. That is how it ended up
   21px visible under the topbar. Clipping is height- and container-
   independent, and :focus restores it as position: fixed so the visible
   state is anchored to the viewport rather than to the desktop pane. */

.skip-link {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.skip-link:focus {
  position: fixed;
  top: var(--space-2);
  left: var(--space-2);
  z-index: var(--z-panel);
  width: auto;
  height: auto;
  margin: 0;
  padding: var(--space-2) var(--space-3);
  overflow: visible;
  clip-path: none;
  white-space: normal;
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: var(--radius-s);
  color: var(--accent);
}
```

- [ ] **Step 3: Run the existing suite to confirm nothing regressed**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test
```

Expected: PASS. (jsdom has no layout engine, so no unit test can prove this fix — Task 10 measures it in a real browser. That is deliberate and is the reason Task 10 exists.)

- [ ] **Step 4: Verify build and types**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npx tsc --noEmit && npm run lint && npm run build
```

Expected: types clean, lint at 3 pre-existing warnings, build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim
git add ui/src/theme.css
git commit -m "a11y: hide the skip link by clipping, not by translating (phase 1)"
```

---

### Task 2: Control failures speak

Fixes reported defect #1. The button is not broken — the failure is silent.

**Files:**
- Modify: `ui/src/strings.ts` (the `control` group, around line 146)
- Modify: `ui/src/App.tsx:110-143`
- Test: `ui/src/App.test.tsx` (append a new `describe`)

**Interfaces:**
- Consumes: `toastStore.push({kind, message, dedupeKey})` from `components/toastStore.tsx`; `ControlActionResponse = {ok:true, job} | {ok:false, error:string}` from `api.ts:268-270`
- Produces: `strings.control.actionFailed(detail: string): string`

- [ ] **Step 1: Write the failing test**

Append to `ui/src/App.test.tsx`. Note this drives the **actual reported path**: an ended session renders `Score`, whose New attempt button calls `startControlReset()`.

```tsx
const endedSession: SessionSnapshot = {
  state: "ended",
  bank: "ckad-mock-01",
  startedAt: "2026-07-25T12:00:00Z",
  durationSeconds: 7200,
  remainingSeconds: 0,
  endReason: "submitted",
};

const results = {
  status: "ready",
  results: {
    percent: 0,
    passed: false,
    earned: 0,
    total: 17,
    passingScore: 66,
    questions: [],
  },
};

describe("App control failures", () => {
  // The reported bug: with the conductor container down the facilitator's
  // proxy returns 502, startControlReset resolves {ok:false}, and the
  // ok:false branch rendered nothing at all — no toast, no overlay. The
  // button looked dead while the server was working correctly.
  test("tells the user when a control action is refused instead of doing nothing", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const json = (body: unknown, status = 200) =>
          new Response(JSON.stringify(body), { status });

        if (url.endsWith("/api/control/reset") && init?.method === "POST") {
          // Exactly what the proxy returns when the conductor is down:
          // 502 with an empty body.
          return new Response("", { status: 502 });
        }
        if (url.endsWith("/api/control/status")) return json({ busy: false });
        if (url.endsWith("/api/session")) return json(endedSession);
        if (url.endsWith("/api/results")) return json(results);
        if (url.endsWith("/api/exam")) return json(exam);
        if (url.endsWith("/api/control/banks")) return json(banks);
        return json({});
      }),
    );

    render(<App />);
    const button = await screen.findByRole("button", { name: "New attempt" });
    await user.click(button);

    const alert = await screen.findByText(/control plane/i);
    expect(alert).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test -- App.test.tsx
```

Expected: FAIL — `Unable to find an element with the text: /control plane/i`. That failure *is* the reported bug.

- [ ] **Step 3: Add the copy**

In `ui/src/strings.ts`, inside the `control:` group (after `dismiss: "Dismiss",`):

```ts
    // "HTTP 502" is true and useless. Name the likely cause and the
    // check that confirms it; keep the raw status as trailing detail.
    actionFailed: (detail: string) =>
      `Couldn't reach the control plane (${detail}). The conductor container may be down — check it with \`docker compose ps conductor\`.`,
```

- [ ] **Step 4: Surface the failure in App**

In `ui/src/App.tsx`, add the import:

```tsx
import { toastStore } from "./components/toastStore";
```

Replace the `else` branch of `applyControlResult` (`App.tsx:119-123`):

```tsx
    } else {
      // Most likely 409 busy or 502 (conductor down). Either way the user
      // pressed a button and must be told why nothing is happening.
      toastStore.push({
        kind: "warning",
        message: strings.control.actionFailed(result.error),
        dedupeKey: "control-action",
      });
      const current = await getControlStatus().catch(() => null);
      if (current) setControl(current);
    }
```

Replace `handleNewAttempt` and `handleRetry` (`App.tsx:130-143`) so a rejected fetch also speaks:

```tsx
  const runControlAction = useCallback(
    async (start: () => Promise<ControlActionResponse>) => {
      try {
        applyControlResult(await start());
      } catch (err) {
        // fetch itself rejected (facilitator unreachable, network down).
        toastStore.push({
          kind: "warning",
          message: strings.control.actionFailed(String(err)),
          dedupeKey: "control-action",
        });
      }
    },
    [applyControlResult],
  );

  const handleNewAttempt = useCallback(
    () => runControlAction(startControlReset),
    [runControlAction],
  );

  const handleRetry = useCallback(
    (op: string, bank: string) =>
      runControlAction(() =>
        op === "switch" && bank ? startControlSwitch(bank) : startControlReset(),
      ),
    [runControlAction],
  );
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test -- App.test.tsx
```

Expected: PASS, both tests in the file.

- [ ] **Step 6: Full verification**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test && npx tsc --noEmit && npm run lint && npm run build
```

- [ ] **Step 7: Commit**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim
git add ui/src/App.tsx ui/src/strings.ts ui/src/App.test.tsx
git commit -m "ui: a refused control action says so instead of doing nothing (phase 2)"
```

---

### Task 3: Global progress store and bar

Standalone and testable on its own. Built before `useAsync` because `useAsync` will call into it.

**Files:**
- Create: `ui/src/components/progressStore.ts`
- Create: `ui/src/components/progressStore.test.ts`
- Create: `ui/src/components/TopProgress.tsx`
- Modify: `ui/src/App.tsx` (render `<TopProgress />`)
- Modify: `ui/src/strings.ts`
- Modify: `ui/src/theme.css`

**Interfaces:**
- Consumes: nothing
- Produces: `progressStore.start(): void`, `progressStore.done(): void`, `progressStore.subscribe(l: () => void): () => void`, `progressStore.isVisible(): boolean`, `progressStore.reset(): void` (tests only); component `TopProgress`

- [ ] **Step 1: Write the failing test**

Create `ui/src/components/progressStore.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { progressStore } from "./progressStore";

beforeEach(() => {
  vi.useFakeTimers();
  progressStore.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("progressStore", () => {
  test("stays hidden for work that finishes quickly", () => {
    progressStore.start();
    vi.advanceTimersByTime(150);
    progressStore.done();
    vi.advanceTimersByTime(1000);
    // A local fetch that resolves in 150ms must not flash a bar.
    expect(progressStore.isVisible()).toBe(false);
  });

  test("shows once work outlasts the delay", () => {
    progressStore.start();
    vi.advanceTimersByTime(250);
    expect(progressStore.isVisible()).toBe(true);
  });

  test("stays visible for the minimum once shown", () => {
    progressStore.start();
    vi.advanceTimersByTime(250);
    progressStore.done();
    vi.advanceTimersByTime(100);
    expect(progressStore.isVisible()).toBe(true);
    vi.advanceTimersByTime(250);
    expect(progressStore.isVisible()).toBe(false);
  });

  test("tracks concurrent work and hides only when all of it settles", () => {
    progressStore.start();
    progressStore.start();
    vi.advanceTimersByTime(250);
    progressStore.done();
    vi.advanceTimersByTime(400);
    expect(progressStore.isVisible()).toBe(true);
    progressStore.done();
    vi.advanceTimersByTime(400);
    expect(progressStore.isVisible()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test -- progressStore
```

Expected: FAIL — cannot resolve `./progressStore`.

- [ ] **Step 3: Implement the store**

Create `ui/src/components/progressStore.ts`:

```ts
// Counts in-flight work the user is waiting on, and decides when a bar is
// worth showing. Same module-singleton shape as toastStore: no context, no
// provider, usable from non-React code.
//
// The two timings exist to stop the bar being noise. Local fetches against
// the facilitator usually resolve in tens of milliseconds, so showing
// immediately would strobe on every navigation; and a bar that appears must
// stay long enough to be read as progress rather than a glitch.

const SHOW_DELAY_MS = 200;
const MIN_VISIBLE_MS = 300;

class ProgressStore {
  private inFlight = 0;
  private visible = false;
  private listeners = new Set<() => void>();
  private showTimer: number | null = null;
  private hideTimer: number | null = null;
  private shownAt = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  isVisible = (): boolean => this.visible;

  start(): void {
    this.inFlight++;
    if (this.inFlight !== 1) return;
    if (this.hideTimer !== null) {
      // Work restarted inside the min-visible window: keep the bar up.
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
      return;
    }
    if (this.visible || this.showTimer !== null) return;
    this.showTimer = window.setTimeout(() => {
      this.showTimer = null;
      this.visible = true;
      this.shownAt = Date.now();
      this.notify();
    }, SHOW_DELAY_MS);
  }

  done(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    if (this.inFlight > 0) return;
    if (this.showTimer !== null) {
      // Finished before the bar ever appeared — the common case.
      window.clearTimeout(this.showTimer);
      this.showTimer = null;
      return;
    }
    if (!this.visible || this.hideTimer !== null) return;
    const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - this.shownAt));
    this.hideTimer = window.setTimeout(() => {
      this.hideTimer = null;
      this.visible = false;
      this.notify();
    }, remaining);
  }

  /** Test-only: drop all state and timers. */
  reset(): void {
    if (this.showTimer !== null) window.clearTimeout(this.showTimer);
    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    this.showTimer = null;
    this.hideTimer = null;
    this.inFlight = 0;
    this.visible = false;
    this.shownAt = 0;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

export const progressStore = new ProgressStore();
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test -- progressStore
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Add the copy**

In `ui/src/strings.ts`, inside the `app:` group:

```ts
    working: "Loading…",
```

- [ ] **Step 6: Build the bar component**

Create `ui/src/components/TopProgress.tsx`:

```tsx
import { useSyncExternalStore } from "react";
import { progressStore } from "./progressStore";
import { strings } from "../strings";

// A single indeterminate bar pinned to the top of the viewport. Determinate
// would need historical phase durations, which is a follow-up — see
// docs/follow-ups.md.
export function TopProgress() {
  const visible = useSyncExternalStore(progressStore.subscribe, progressStore.isVisible);
  if (!visible) return null;
  return (
    <div className="top-progress" role="status">
      <span className="sr-only">{strings.app.working}</span>
      <div className="top-progress-track">
        <div className="top-progress-bar" />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Style it**

Append to `ui/src/theme.css`, immediately before the `/* ---- motion ---- */` comment block:

```css
/* ---- global progress bar ---- */

.top-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: var(--z-toast);
  pointer-events: none;
}

.top-progress-track {
  height: 3px;
  overflow: hidden;
  background: transparent;
}

.top-progress-bar {
  height: 100%;
  width: 100%;
  background: var(--accent);
  /* Calm default: a static full-width accent rule. The travelling
     animation is layered on only for users who accept motion. */
  transform-origin: 0 50%;
}

@media (prefers-reduced-motion: no-preference) {
  .top-progress-bar {
    width: 40%;
    animation: top-progress-slide 1.1s var(--ease-out) infinite;
  }

  @keyframes top-progress-slide {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(350%);
    }
  }
}
```

Note: `--accent` on `--bg` is an existing token pairing already used for `.skip-link` text and links; no new colour pairing is introduced, so no hand-computed contrast entry is required.

- [ ] **Step 8: Render it in App**

In `ui/src/App.tsx`, add the import:

```tsx
import { TopProgress } from "./components/TopProgress";
```

and render it as the first child of the returned fragment (`App.tsx:202-204`):

```tsx
  return (
    <>
      <TopProgress />
      <main>{screen}</main>
```

- [ ] **Step 9: Full verification**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test && npx tsc --noEmit && npm run lint && npm run build
```

- [ ] **Step 10: Commit**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim
git add ui/src/components/progressStore.ts ui/src/components/progressStore.test.ts ui/src/components/TopProgress.tsx ui/src/App.tsx ui/src/strings.ts ui/src/theme.css
git commit -m "ui: a global progress bar that does not strobe (phase 3)"
```

---

### Task 4: useAsync and the Async boundary

The structural fix. `Async` makes "render nothing on failure" inexpressible.

**Files:**
- Create: `ui/src/lib/useAsync.ts`
- Create: `ui/src/lib/useAsync.test.ts`
- Create: `ui/src/components/Async.tsx`
- Create: `ui/src/components/Async.test.tsx`

**Interfaces:**
- Consumes: `progressStore.start()`, `progressStore.done()` from Task 3
- Produces:
  - `type AsyncStatus = "idle" | "loading" | "success" | "error"`
  - `interface AsyncState<T> { status: AsyncStatus; data: T | null; error: string | null; reload: () => void }`
  - `interface UseAsyncOptions { background?: boolean; enabled?: boolean }`
  - `useAsync<T>(fn: () => Promise<T>, deps: unknown[], opts?: UseAsyncOptions): AsyncState<T>`
  - `Async<T>({ state, error, loading, children })` where `error: (message: string, reload: () => void) => ReactNode` is **required**

- [ ] **Step 1: Write the failing hook test**

Create `ui/src/lib/useAsync.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAsync } from "./useAsync";
import { progressStore } from "../components/progressStore";

beforeEach(() => {
  progressStore.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useAsync", () => {
  test("reports success and exposes the data", async () => {
    const { result } = renderHook(() => useAsync(async () => "value", []));
    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.data).toBe("value");
    expect(result.current.error).toBeNull();
  });

  test("reports the message from a rejection", async () => {
    const { result } = renderHook(() =>
      useAsync(async () => {
        throw new Error("HTTP 502");
      }, []),
    );
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("HTTP 502");
  });

  test("reload re-runs the function", async () => {
    const fn = vi.fn(async () => "value");
    const { result } = renderHook(() => useAsync(fn, []));
    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(fn).toHaveBeenCalledTimes(1);
    result.current.reload();
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
  });

  test("a resolution after unmount does not set state", async () => {
    let settle: (v: string) => void = () => {};
    const { result, unmount } = renderHook(() =>
      useAsync(() => new Promise<string>((r) => (settle = r)), []),
    );
    unmount();
    settle("late");
    await Promise.resolve();
    expect(result.current.status).toBe("loading");
  });

  test("background calls do not touch the progress bar", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useAsync(() => new Promise<string>(() => {}), [], { background: true }),
    );
    vi.advanceTimersByTime(500);
    // A 3s results poll must not leave the bar up permanently.
    expect(progressStore.isVisible()).toBe(false);
    expect(result.current.status).toBe("loading");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test -- useAsync
```

Expected: FAIL — cannot resolve `./useAsync`.

- [ ] **Step 3: Implement the hook**

Create `ui/src/lib/useAsync.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { progressStore } from "../components/progressStore";

export type AsyncStatus = "idle" | "loading" | "success" | "error";

export interface AsyncState<T> {
  status: AsyncStatus;
  data: T | null;
  error: string | null;
  reload: () => void;
}

export interface UseAsyncOptions {
  /**
   * Pollers pass true. A repeating call must not drive the global bar —
   * the results poll (3s) and the busy control poll (2s) would otherwise
   * leave it up permanently. The bar reflects work the user is waiting
   * on, not every request in flight.
   */
  background?: boolean;
  /** When false the function is never called and status stays "idle". */
  enabled?: boolean;
}

/**
 * Runs an async function and reports its state, cancelling on unmount.
 * Replaces the per-call-site `cancelled` flag pattern.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[],
  opts: UseAsyncOptions = {},
): AsyncState<T> {
  const { background = false, enabled = true } = opts;
  const [status, setStatus] = useState<AsyncStatus>("idle");
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // The caller almost always passes an inline closure; keeping it in a ref
  // means a new identity per render does not re-trigger the effect, while
  // the effect still calls the latest one.
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setStatus("loading");
    setError(null);
    if (!background) progressStore.start();

    fnRef
      .current()
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setStatus("success");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      })
      .finally(() => {
        if (!background) progressStore.done();
      });

    return () => {
      cancelled = true;
    };
    // deps is the caller's dependency list, spread so each entry is compared
    // individually; nonce drives reload().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, enabled, background]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { status, data, error, reload };
}
```

- [ ] **Step 4: Run the hook test to verify it passes**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test -- useAsync
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing boundary test**

Create `ui/src/components/Async.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { Async } from "./Async";
import type { AsyncState } from "../lib/useAsync";

const state = <T,>(over: Partial<AsyncState<T>>): AsyncState<T> => ({
  status: "idle",
  data: null,
  error: null,
  reload: () => {},
  ...over,
});

describe("Async", () => {
  test("renders the error branch when the call failed", () => {
    render(
      <Async
        state={state<string>({ status: "error", error: "HTTP 502" })}
        error={(message) => <p>failed: {message}</p>}
      >
        {(data) => <p>{data}</p>}
      </Async>,
    );
    expect(screen.getByText("failed: HTTP 502")).toBeInTheDocument();
  });

  test("renders children once data has arrived", () => {
    render(
      <Async
        state={state({ status: "success", data: "hello" })}
        error={(message) => <p>{message}</p>}
      >
        {(data) => <p>{data}</p>}
      </Async>,
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  test("keeps showing data while a reload is in flight", () => {
    render(
      <Async
        state={state({ status: "loading", data: "stale" })}
        error={(message) => <p>{message}</p>}
        loading={<p>spinner</p>}
      >
        {(data) => <p>{data}</p>}
      </Async>,
    );
    expect(screen.getByText("stale")).toBeInTheDocument();
    expect(screen.queryByText("spinner")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run it to make sure it fails**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test -- Async
```

Expected: FAIL — cannot resolve `./Async`.

- [ ] **Step 7: Implement the boundary**

Create `ui/src/components/Async.tsx`:

```tsx
import type { ReactNode } from "react";
import type { AsyncState } from "../lib/useAsync";

interface AsyncProps<T> {
  state: AsyncState<T>;
  /**
   * Required, deliberately. Milestone F exists because two screens
   * rendered nothing when a fetch failed — a 502 became an empty lobby and
   * a dead button. Making this prop mandatory turns that mistake into a
   * type error rather than something review has to catch.
   */
  error: (message: string, reload: () => void) => ReactNode;
  loading?: ReactNode;
  children: (data: T) => ReactNode;
}

export function Async<T>({ state, error, loading = null, children }: AsyncProps<T>) {
  if (state.status === "error") {
    return <>{error(state.error ?? "", state.reload)}</>;
  }
  // Data survives a reload, so refreshing never blanks a working screen.
  if (state.data !== null) {
    return <>{children(state.data)}</>;
  }
  return <>{loading}</>;
}
```

- [ ] **Step 8: Run the boundary test to verify it passes**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test -- Async
```

Expected: PASS, 3 tests.

- [ ] **Step 9: Full verification**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test && npx tsc --noEmit && npm run lint && npm run build
```

- [ ] **Step 10: Commit**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim
git add ui/src/lib/useAsync.ts ui/src/lib/useAsync.test.ts ui/src/components/Async.tsx ui/src/components/Async.test.tsx
git commit -m "ui: one async primitive, with an error branch you cannot omit (phase 4)"
```

---

### Task 5: The catalog stops vanishing

Fixes defect #4 — the worst of the four, because the app silently misrepresents itself as single-exam.

**Files:**
- Modify: `ui/src/screens/Start.tsx`
- Modify: `ui/src/strings.ts`
- Modify: `ui/src/theme.css`
- Test: `ui/src/screens/Start.test.tsx`

**Interfaces:**
- Consumes: `useAsync`, `Async` from Task 4; `getBanks(): Promise<BanksResponse>` from `api.ts:301`
- Produces: nothing new

- [ ] **Step 1: Write the failing test**

Append to `ui/src/screens/Start.test.tsx`. It already defines `ckadExam` (an `ExamInfo`) and `banksFor(active)`, and already imports `describe`/`test`/`expect`/`vi`, `render`/`screen`, and `Start` — reuse those rather than redefining. Its existing `mockApi` helper always resolves 200, so this test stubs fetch directly to produce the 502:

```tsx
describe("Start catalog failures", () => {
  // Reproduced 2026-07-25 by stopping the conductor: GET /api/control/banks
  // returns 502, the catch left the catalog null, and the entire "CHOOSE
  // YOUR EXAM" section disappeared with no error. The lobby looked like a
  // single-exam app.
  test("shows an error with a retry when the catalog cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/control/banks")) return new Response("", { status: 502 });
        if (url.endsWith("/api/exam"))
          return new Response(JSON.stringify(ckadExam), { status: 200 });
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    render(
      <Start
        onSessionChange={() => {}}
        onControlStart={() => {}}
        catalogVersion={0}
        onBanksLoaded={() => {}}
      />,
    );

    expect(await screen.findByText(/couldn't load the exam catalog/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
```

The file's existing `afterEach` calls `vi.unstubAllGlobals()`; confirm that before relying on it, and add one if absent.

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test -- Start
```

Expected: FAIL — the error text is not in the document, because the failure renders nothing.

- [ ] **Step 3: Add the copy**

In `ui/src/strings.ts`, inside the `start:` group:

```ts
    catalogErrorTitle: "Couldn't load the exam catalog",
    catalogErrorBody: (detail: string) =>
      `The control plane did not answer (${detail}). Your current exam below still works — the list of other exams needs the conductor container.`,
    catalogRetry: "Retry",
```

- [ ] **Step 4: Move the catalog fetch onto useAsync**

In `ui/src/screens/Start.tsx`, replace the banks-fetching effect and its state with:

```tsx
  const banksState = useAsync(getBanks, [catalogVersion]);

  useEffect(() => {
    if (banksState.data) onBanksLoaded(banksState.data);
  }, [banksState.data, onBanksLoaded]);
```

and wrap the catalog section's render in the boundary:

```tsx
      <Async
        state={banksState}
        loading={<p className="catalog-loading">{strings.app.working}</p>}
        error={(message, reload) => (
          <div className="catalog-error" role="alert">
            <p className="catalog-error-title">{strings.start.catalogErrorTitle}</p>
            <p className="catalog-error-body">{strings.start.catalogErrorBody(message)}</p>
            <button type="button" className="btn btn-secondary" onClick={reload}>
              {strings.start.catalogRetry}
            </button>
          </div>
        )}
      >
        {(banks) => (
          /* the existing catalog markup, with `banks` in scope */
        )}
      </Async>
```

Keep the existing card markup verbatim inside the children function — this task changes *where* the data comes from and what happens when it fails, not how a card looks.

Add the imports:

```tsx
import { useAsync } from "../lib/useAsync";
import { Async } from "../components/Async";
```

- [ ] **Step 5: Style the error card**

Append to `ui/src/theme.css`, after the start-screen rules:

```css
.catalog-error {
  border: 1px solid var(--danger);
  border-radius: var(--radius-s);
  background: var(--surface);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-start;
}

.catalog-error-title {
  font-weight: 600;
  margin: 0;
}

.catalog-error-body {
  color: var(--text-muted);
  margin: 0;
}

.catalog-loading {
  color: var(--text-muted);
}
```

`--danger` as a border on `--surface` is an existing pairing (`.score-banner.fail`), so no new contrast entry is required.

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test -- Start
```

Expected: PASS.

- [ ] **Step 7: Full verification**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test && npx tsc --noEmit && npm run lint && npm run build
```

- [ ] **Step 8: Commit**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim
git add ui/src/screens/Start.tsx ui/src/screens/Start.test.tsx ui/src/strings.ts ui/src/theme.css
git commit -m "ui: a failed catalog fetch says so instead of hiding the exams (phase 5)"
```

---

### Task 6: One markdown renderer

Replaces the two divergent markdown paths with a single component. No highlighting yet — that is Task 7, kept separate because it adds a dependency and a lockfile rebuild.

**Files:**
- Create: `ui/src/components/Markdown.tsx`
- Create: `ui/src/components/Markdown.test.tsx`
- Modify: `ui/src/components/QuestionPanel.tsx` (remove its local renderer)
- Modify: `ui/src/strings.ts`
- Modify: `ui/src/theme.css`

**Interfaces:**
- Consumes: `desktopClipboard.copy(text: string): Promise<CopyOutcome>` from `lib/desktopClipboard.ts`; `toastStore.push`
- Produces: `Markdown({ children }: { children: string })`

- [ ] **Step 1: Write the failing test**

Create `ui/src/components/Markdown.test.tsx`:

```tsx
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Markdown } from "./Markdown";
import { desktopClipboard } from "../lib/desktopClipboard";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Markdown", () => {
  test("inline code becomes a copy button", () => {
    render(<Markdown>{"Label the Namespace `team=aurora` first."}</Markdown>);
    expect(screen.getByRole("button", { name: /team=aurora/ })).toBeInTheDocument();
  });

  test("a fenced block is a code block, not a copy button", () => {
    render(<Markdown>{"```yaml\nkind: Pod\n```"}</Markdown>);
    // The whole listing must not collapse into one giant button.
    expect(screen.queryByRole("button", { name: /kind: Pod/ })).not.toBeInTheDocument();
    expect(screen.getByText("yaml")).toBeInTheDocument();
  });

  test("a fenced block copies its whole body to the desktop", async () => {
    const user = userEvent.setup();
    const copy = vi.spyOn(desktopClipboard, "copy").mockResolvedValue("desktop");
    render(<Markdown>{"```bash\nkubectl get pods\nkubectl get svc\n```"}</Markdown>);

    await user.click(screen.getByRole("button", { name: /copy/i }));

    expect(copy).toHaveBeenCalledWith("kubectl get pods\nkubectl get svc");
  });

  test("a fenced block with no language still renders as a block", () => {
    render(<Markdown>{"```\nplain listing\n```"}</Markdown>);
    expect(screen.queryByRole("button", { name: /plain listing/ })).not.toBeInTheDocument();
    expect(screen.getByText("text")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test -- Markdown
```

Expected: FAIL — cannot resolve `./Markdown`.

- [ ] **Step 3: Add the copy**

In `ui/src/strings.ts`, add a new group after `questionPanel`:

```ts
  markdown: {
    plainLanguage: "text",
    copyBlock: "Copy",
    copiedBlockToDesktop: "Copied to the exam desktop — paste with Ctrl+Shift+V.",
    copiedBlock: "Copied to the clipboard.",
    copyFailed: "Couldn't copy that.",
  },
```

- [ ] **Step 4: Implement the renderer**

Create `ui/src/components/Markdown.tsx`:

```tsx
import type { ReactElement, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { desktopClipboard } from "../lib/desktopClipboard";
import { strings } from "../strings";
import { toastStore } from "./toastStore";

// The single markdown renderer for the app. Questions and solutions come
// from the same bank files and must read identically; before this existed
// they had two renderers and only the question one was finished, so
// solutions rendered unstyled and overflowed the page sideways.

// Bank questions mark every value a candidate must reproduce exactly —
// resource names, labels, image tags, /opt/course paths — as inline code.
// Rendering those as buttons turns "retype this without a typo" into one
// click, and the click pushes the value into the exam desktop's clipboard.
function CopyableCode({ children }: { children: ReactNode }) {
  const value = typeof children === "string" ? children : String(children ?? "");

  const copy = async () => {
    const outcome = await desktopClipboard.copy(value);
    toastStore.push({
      kind: outcome === "failed" ? "warning" : "info",
      message:
        outcome === "desktop"
          ? strings.questionPanel.copiedToDesktop(value)
          : outcome === "browser"
            ? strings.questionPanel.copied(value)
            : strings.questionPanel.copyFailed,
      dedupeKey: "copy-value",
    });
  };

  return (
    <button
      type="button"
      className="copy-value"
      onClick={copy}
      aria-label={strings.questionPanel.copyValue(value)}
    >
      <code>{children}</code>
      <span className="copy-value-icon" aria-hidden="true">
        ⧉
      </span>
    </button>
  );
}

// A fenced listing: language chip, one copy control for the whole body, and
// a pre that scrolls inside itself rather than pushing the page sideways.
function CodeBlock({ className, children }: { className?: string; children?: ReactNode }) {
  const language = /language-(\w+)/.exec(className ?? "")?.[1] ?? "";
  const body = String(children ?? "").replace(/\n$/, "");

  const copy = async () => {
    const outcome = await desktopClipboard.copy(body);
    toastStore.push({
      kind: outcome === "failed" ? "warning" : "info",
      message:
        outcome === "desktop"
          ? strings.markdown.copiedBlockToDesktop
          : outcome === "browser"
            ? strings.markdown.copiedBlock
            : strings.markdown.copyFailed,
      dedupeKey: "copy-block",
    });
  };

  return (
    <figure className="code-block">
      <figcaption className="code-block-head">
        <span className="code-block-lang">{language || strings.markdown.plainLanguage}</span>
        <button type="button" className="code-block-copy" onClick={copy}>
          {strings.markdown.copyBlock}
        </button>
      </figcaption>
      <pre>
        <code className={className}>{body}</code>
      </pre>
    </figure>
  );
}

interface CodeChildProps {
  className?: string;
  children?: ReactNode;
}

const COMPONENTS = {
  // react-markdown routes fenced blocks through `code` too, and a fenced
  // block with no language has no className — indistinguishable from
  // inline code at that level. Overriding `pre` instead and reading the
  // child's props is what keeps a language-less listing from collapsing
  // into a single copy button.
  pre: ({ children }: { children?: ReactNode }) => {
    const child = (Array.isArray(children) ? children[0] : children) as
      | ReactElement<CodeChildProps>
      | undefined;
    return (
      <CodeBlock className={child?.props?.className}>{child?.props?.children}</CodeBlock>
    );
  },
  code: ({ children, className }: CodeChildProps) =>
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <CopyableCode>{children}</CopyableCode>
    ),
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown components={COMPONENTS}>{children}</ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test -- Markdown
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Point QuestionPanel at it**

In `ui/src/components/QuestionPanel.tsx`, delete `CopyableCode` and `MARKDOWN_COMPONENTS` (lines 13-56) and the `ReactMarkdown`, `desktopClipboard` and `toastStore` imports. Replace the render at lines 136-140 with:

```tsx
            {!loading && !error && <Markdown>{selectedId ? markdown : ""}</Markdown>}
```

and add:

```tsx
import { Markdown } from "./Markdown";
```

- [ ] **Step 7: Rename the CSS namespace and add code-block chrome**

In `ui/src/theme.css`, rename the selectors `.question-markdown`, `.question-markdown pre`, `.question-markdown code`, and `.question-markdown pre code` (lines 444-502) to `.md`, `.md pre`, `.md code`, `.md pre code`. Keep every declaration as-is — `.md pre` already carries `overflow-x: auto`, which is exactly what solutions were missing.

Then append the chrome:

```css
/* ---- fenced code blocks ---- */

.code-block {
  margin: var(--space-3) 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-s);
  background: var(--surface-raised);
  overflow: hidden;
}

.code-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.code-block-lang {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.code-block-copy {
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-s);
  color: var(--accent);
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
}

.code-block-copy:hover {
  border-color: var(--accent);
}

.code-block pre {
  margin: 0;
  padding: var(--space-3);
  overflow-x: auto;
}
```

Token names verified against `ui/src/styles/tokens.css`: `--surface-raised` (line 29 light / 119 dark), `--text-xs` (line 63), `--border`, `--radius-s`, `--accent` and the `--space-*` scale all exist. Do not invent tokens.

- [ ] **Step 8: Full verification**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test && npx tsc --noEmit && npm run lint && npm run build
```

Expected: the existing `QuestionPanel.test.tsx` still passes — its inline-copy assertions now exercise `Markdown`.

- [ ] **Step 9: Commit**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim
git add ui/src/components/Markdown.tsx ui/src/components/Markdown.test.tsx ui/src/components/QuestionPanel.tsx ui/src/strings.ts ui/src/theme.css
git commit -m "ui: one markdown renderer, with real code blocks (phase 6)"
```

---

### Task 7: Lazy syntax highlighting

**Files:**
- Create: `ui/src/lib/highlight.ts`
- Modify: `ui/src/components/Markdown.tsx`
- Modify: `ui/src/theme.css`
- Modify: `ui/package.json`, `ui/package-lock.json`

**Interfaces:**
- Consumes: `CodeBlock` from Task 6
- Produces: `highlightTo(language: string, code: string): Promise<string | null>` — resolved HTML, or null when the language is not in the subset

- [ ] **Step 1: Add the dependency inside node:22-alpine**

Host npm resolves differently and breaks the image's `npm ci`. From the repo root:

```bash
cd /Users/cjoga/Labs/kubestronaut-sim
docker run --rm -v "$PWD":/repo -w /repo/ui node:22-alpine npm install --save highlight.js@^11.11.1
```

- [ ] **Step 2: Verify the lockfile installs cleanly in the image**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim
docker run --rm -v "$PWD":/repo -w /repo/ui node:22-alpine npm ci
```

Expected: completes without resolution errors. If it fails, delete `ui/node_modules` and `ui/package-lock.json` and redo Step 1 — never regenerate the lockfile with host npm.

- [ ] **Step 3: Write the loader**

Create `ui/src/lib/highlight.ts`:

```ts
// Syntax highlighting for the three languages bank content actually uses.
//
// Registering the full highlight.js language pack would add far more to the
// bundle than the exam needs — docs/follow-ups.md already flags the ~470KB
// baseline. The core plus three grammars is loaded on demand, so the lobby
// never pays for it and a candidate who opens no code block never downloads
// it.

const SUPPORTED = new Set(["yaml", "bash", "sh", "shell", "json"]);

let enginePromise: Promise<typeof import("highlight.js/lib/core").default> | null = null;

async function engine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const [{ default: hljs }, yaml, bash, json] = await Promise.all([
        import("highlight.js/lib/core"),
        import("highlight.js/lib/languages/yaml"),
        import("highlight.js/lib/languages/bash"),
        import("highlight.js/lib/languages/json"),
      ]);
      hljs.registerLanguage("yaml", yaml.default);
      hljs.registerLanguage("bash", bash.default);
      hljs.registerLanguage("json", json.default);
      hljs.registerAliases(["sh", "shell"], { languageName: "bash" });
      return hljs;
    })();
  }
  return enginePromise;
}

/** Returns highlighted HTML, or null when the language is out of scope. */
export async function highlightTo(language: string, code: string): Promise<string | null> {
  if (!SUPPORTED.has(language)) return null;
  try {
    const hljs = await engine();
    return hljs.highlight(code, { language }).value;
  } catch {
    // A grammar that failed to load must never cost the user the listing.
    return null;
  }
}
```

- [ ] **Step 4: Use it in CodeBlock**

In `ui/src/components/Markdown.tsx`, add:

```tsx
import { useEffect, useState } from "react";
import { highlightTo } from "../lib/highlight";
```

and inside `CodeBlock`, above the return:

```tsx
  // Renders plain first, then swaps in highlighted markup once the grammar
  // resolves. Same font, size and spacing either way, so nothing moves.
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    highlightTo(language, body).then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => {
      cancelled = true;
    };
  }, [language, body]);
```

and replace the `<pre>` with:

```tsx
      <pre>
        {html === null ? (
          <code className={className}>{body}</code>
        ) : (
          <code className={className} dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </pre>
```

`dangerouslySetInnerHTML` is safe here: the input is bank markdown from the local repo, and highlight.js escapes the source text it emits.

- [ ] **Step 5: Add token-coloured highlight styles**

Append to `ui/src/theme.css`:

```css
/* highlight.js class names, mapped onto theme tokens so both themes work.
   Contrast ratios against --surface-raised are recorded in tokens.css. */
.md .hljs-attr,
.md .hljs-attribute,
.md .hljs-keyword,
.md .hljs-built_in {
  color: var(--accent);
}

.md .hljs-string,
.md .hljs-number,
.md .hljs-literal {
  color: var(--text);
}

.md .hljs-comment,
.md .hljs-meta {
  color: var(--text-muted);
  font-style: italic;
}
```

- [ ] **Step 6: Record the contrast ratios**

axe cannot compute these. Measure each of `--accent`, `--text` and `--text-muted` against `--surface-raised` in both themes with any contrast checker, and add a comment block to `ui/src/styles/tokens.css` next to the existing recorded ratios (there are already such blocks at lines 38-40 and 128-129 — match their format). Every pairing must be ≥ 4.5:1. If `--text-muted` on `--surface-raised` falls short in either theme, use `--text` for comments instead and record why.

- [ ] **Step 7: Verify the tests still pass and measure the bundle**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test && npx tsc --noEmit && npm run lint && npm run build
```

Record the printed chunk sizes in the commit message. The highlight chunk must be a **separate** chunk, not folded into the main bundle — if vite inlined it, the dynamic import was written wrong.

- [ ] **Step 8: Commit**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim
git add ui/package.json ui/package-lock.json ui/src/lib/highlight.ts ui/src/components/Markdown.tsx ui/src/theme.css ui/src/styles/tokens.css
git commit -m "ui: lazy yaml/bash/json highlighting in code blocks (phase 7)"
```

---

### Task 8: Solutions render like questions, and the score screen fits a phone

Fixes defect #3.

**Files:**
- Modify: `ui/src/screens/Score.tsx`
- Modify: `ui/src/theme.css`
- Test: `ui/src/screens/Score.test.tsx` (create)

**Interfaces:**
- Consumes: `Markdown` from Task 6
- Produces: nothing new

- [ ] **Step 1: Write the failing test**

Create `ui/src/screens/Score.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Score } from "./Score";

const results = {
  status: "ready",
  results: {
    percent: 0,
    passed: false,
    earned: 0,
    total: 5,
    passingScore: 66,
    questions: [
      {
        id: "q01",
        instance: "instance-1",
        domain: "Application Environment",
        earned: 0,
        total: 5,
        checks: [],
      },
    ],
  },
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/results"))
        return new Response(JSON.stringify(results), { status: 200 });
      if (url.includes("/solution"))
        return new Response(
          JSON.stringify({ id: "q01", markdown: "```yaml\nkind: Pod\n```" }),
          { status: 200 },
        );
      return new Response(JSON.stringify({}), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Score solutions", () => {
  // Solutions used to render through a bare <ReactMarkdown> with no
  // components override and no styles, so a long yaml line pushed the whole
  // page sideways and inline values were not copyable.
  test("renders solution markdown through the shared renderer", async () => {
    const user = userEvent.setup();
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);

    await user.click(await screen.findByText("q01"));
    await user.click(screen.getByText(/show solution/i));

    // The shared renderer's code-block chrome, which the bare one lacked.
    expect(await screen.findByText("yaml")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test -- Score
```

Expected: FAIL — no "yaml" chip, because the bare renderer emits no chrome.

- [ ] **Step 3: Switch Score to the shared renderer**

In `ui/src/screens/Score.tsx`, replace the `ReactMarkdown` import with:

```tsx
import { Markdown } from "../components/Markdown";
```

and line 151:

```tsx
        {solution && <Markdown>{solution.markdown}</Markdown>}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test -- Score
```

Expected: PASS.

- [ ] **Step 5: Make the score screen fit a narrow window**

Append to the existing `@media (max-width: 600px)` block in `ui/src/theme.css:1201`:

```css
  .score-screen {
    padding: var(--space-4) var(--space-3);
  }

  .score-banner {
    padding: var(--space-4);
  }

  /* Four flex columns in one row squeeze the domain to nothing on a
     phone; let it take its own line under the id and points. */
  .question-result summary {
    flex-wrap: wrap;
  }

  .qr-domain {
    flex-basis: 100%;
    order: 3;
  }

  .score-actions .btn {
    width: 100%;
  }
```

- [ ] **Step 6: Full verification**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test && npx tsc --noEmit && npm run lint && npm run build
```

- [ ] **Step 7: Commit**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim
git add ui/src/screens/Score.tsx ui/src/screens/Score.test.tsx ui/src/theme.css
git commit -m "ui: solutions render like questions, and the score page fits a phone (phase 8)"
```

---

### Task 9: Screen transitions

The smallest task, deliberately last of the code tasks — it is pure polish and the easiest to drop if anything above runs long.

**Files:**
- Create: `ui/src/components/ScreenTransition.tsx`
- Modify: `ui/src/App.tsx`
- Modify: `ui/src/theme.css`

**Interfaces:**
- Consumes: `session.state` from `App`
- Produces: `ScreenTransition({ screenKey, children }: { screenKey: string; children: ReactNode })`

- [ ] **Step 1: Implement the wrapper**

Create `ui/src/components/ScreenTransition.tsx`:

```tsx
import { useEffect, useState, type ReactNode } from "react";

// Crossfades between lobby / exam / score. Keyed on session.state, which is
// the only thing that changes the visible screen — there is no router.
export function ScreenTransition({
  screenKey,
  children,
}: {
  screenKey: string;
  children: ReactNode;
}) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    setEntered(false);
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, [screenKey]);

  return <div className={`screen${entered ? " screen-entered" : ""}`}>{children}</div>;
}
```

- [ ] **Step 2: Use it in App**

In `ui/src/App.tsx`, add the import and wrap the screen:

```tsx
import { ScreenTransition } from "./components/ScreenTransition";
```

```tsx
      <main>
        <ScreenTransition screenKey={session.state}>{screen}</ScreenTransition>
      </main>
```

- [ ] **Step 3: Style it, motion-additive**

Append to `ui/src/theme.css` inside the existing `@media (prefers-reduced-motion: no-preference)` block:

```css
  .screen {
    opacity: 0;
    transform: translateY(4px);
    transition:
      opacity var(--dur-base) var(--ease-out),
      transform var(--dur-base) var(--ease-out);
  }

  .screen-entered {
    opacity: 1;
    transform: none;
  }
```

Outside any media query, so a reduced-motion user sees a fully-formed screen with no transition at all:

```css
.screen {
  height: 100%;
}
```

Only `opacity` and `transform` are animated — both compositor-only, matching the note at `theme.css:1239-1251`. `--dur-base` (220ms) and `--ease-out` are the existing tokens at `tokens.css:93` and `:97`; the token set deliberately has no `--ease-standard`, so do not reach for one.

- [ ] **Step 4: Full verification**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test && npx tsc --noEmit && npm run lint && npm run build
```

The existing a11y suite must still pass — a wrapper div must not break any landmark or heading assertions.

- [ ] **Step 5: Commit**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim
git add ui/src/components/ScreenTransition.tsx ui/src/App.tsx ui/src/theme.css
git commit -m "ui: crossfade between screens for users who accept motion (phase 9)"
```

---

### Task 10: Real-browser verification pass and docs

The only gate that can catch defect #2's class. Closes `docs/follow-ups.md:48`.

**Files:**
- Modify: `README.md`
- Modify: `docs/follow-ups.md`

**Interfaces:**
- Consumes: everything above
- Produces: nothing

- [ ] **Step 1: Check nothing of the user's is at risk, then rebuild**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim
curl -s http://localhost:8080/api/session
```

If `state` is `running`, **stop and ask** — the steps below end a session. If idle or ended, rebuild the UI into the binary:

```bash
docker compose up -d --build facilitator
```

- [ ] **Step 2: Measure the skip link in a real browser**

Load `http://localhost:8080`, start a session so the exam view renders, and run in the devtools console:

```js
const r = document.querySelector('.skip-link').getBoundingClientRect();
({ height: r.height, top: r.top, bottom: r.bottom, pixelsShowing: Math.max(0, r.bottom) });
```

Expected: `pixelsShowing` is `0`. Before this milestone it was `20.84`. Then press Tab from the address bar and confirm the link **becomes visible and readable** on focus, and that activating it moves focus to the End button.

- [ ] **Step 3: Confirm the reported bug is gone**

With the stack up, stop the conductor to recreate the exact failure:

```bash
docker compose stop conductor
```

Reload the lobby: the catalog must show an error card with a working Retry, **not** an empty section. Then end a session to reach the Score screen and click New attempt: a warning toast must name the control plane. Restart it:

```bash
docker compose start conductor
```

The Retry button must then load the catalog successfully.

- [ ] **Step 4: Walk the three widths in both themes**

At 1440, 900 and 390px, in light and dark:
- lobby, exam (≥900 only), score
- expand a question's checks and its solution; a long yaml line must scroll **inside** the code block, never move the page sideways
- the copy button on a code block reaches the desktop clipboard (paste in the exam terminal with Ctrl+Shift+V)
- 400% zoom at desktop width must not trip the mobile gate

- [ ] **Step 5: Update the docs**

In `README.md`, update the status line to Milestone F and add a sentence to the exam-feel section noting that code blocks in questions and solutions are copiable.

In `docs/follow-ups.md`: strike the resolved milestone-E verification item (the smoke/switch round-trip, which passed on main on 2026-07-25), mark `follow-ups.md:48`'s real-browser item done, and add any new follow-ups this milestone created — at minimum the bundle-size delta from Task 7 if it grew the main chunk.

- [ ] **Step 6: Run the full gate**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim/ui && npm test && npx tsc --noEmit && npm run lint && npm run build
cd /Users/cjoga/Labs/kubestronaut-sim && bash tests/smoke.sh
```

`tests/smoke.sh` is destructive (purges first) and takes ~25 minutes. Do not edit any file under `ui/`, `facilitator/`, `proxy/`, `images/`, `banks/`, `tests/` or `docker-compose.yaml` while it runs.

Expected: `SMOKE PASS`.

- [ ] **Step 7: Commit**

```bash
cd /Users/cjoga/Labs/kubestronaut-sim
git add README.md docs/follow-ups.md
git commit -m "docs: milestone F story and a real-browser verification pass (phase 10)"
```

---

## Self-Review

**Spec coverage:** skip-link hide → Task 1. Control-failure toasts + human copy → Task 2. `progressStore`/`TopProgress` → Task 3. `useAsync` + `Async` with required error branch → Task 4. Catalog error card → Task 5. Single `Markdown` with `CodeBlock` → Task 6. Lazy yaml/bash/json highlighting + language subset + bundle note → Task 7. Solutions through `Markdown` + responsive score → Task 8. `ScreenTransition` → Task 9. Real-browser pass, contrast recording, docs → Tasks 7 and 10. Out-of-scope items (determinate bar, practice mode, trademark) appear in no task, as intended.

**Deviation from the spec, deliberate:** the spec said `readError()` needed an empty-body fallback. It does not — `api.ts:80-87` already falls back to `HTTP <status>`. Task 2 adds human-facing copy instead. The spec was corrected before this plan was written.

**Improvement not in the spec:** Task 6 overrides `pre` rather than only `code`. The existing `code`-only override (`QuestionPanel.tsx:49-56`) turns a fenced block *with no language* into a single giant copy button, since react-markdown gives it no className. Task 6's fourth test pins the corrected behaviour.

**Type consistency:** `AsyncState<T>` is defined in Task 4 and consumed in Tasks 4 and 5 with the same shape. `progressStore.start`/`done`/`subscribe`/`isVisible`/`reset` are defined in Task 3 and used in Tasks 3 and 4. `highlightTo(language, code)` is defined in Task 7 and used only there. `Markdown({children: string})` is defined in Task 6 and consumed in Tasks 6 and 8.

**Plan-time uncertainties, all resolved before hand-off:** every token this plan names was checked against `ui/src/styles/tokens.css`. Three first-draft guesses were wrong and are corrected throughout — there is no `--surface-2` (use `--surface-raised`), no `--ease-standard` (use `--ease-out`), and no `--duration-m` (use `--dur-base`). `Start.test.tsx`'s fixtures were likewise checked: it defines `ckadExam` and `banksFor`, not `exam`/`banks`, and Task 5 uses the real names. No task should begin by discovering an identifier that does not exist.
