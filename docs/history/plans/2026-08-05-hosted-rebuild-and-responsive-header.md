# Hosted rebuild and responsive header — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a hosted "New attempt" read as the rebuild it is instead of as a
facilitator outage, and make the app header usable on a phone.

**Architecture:** Two independent halves. The first adds two machine-readable
facts to the hub (a `code` on the proxy's own error bodies, an `op` on the
session in `/api/me`), teaches `ui/src/api.ts` to carry them on a typed error,
and uses both to suppress a false toast, retitle the boot screen, and route the
candidate somewhere deliberate when the Pod comes back. The second splits
`SessionChip` so the header can own the End-session confirmation, adds a
`HeaderMenu` popover, and collapses the nav and session controls into it below
one breakpoint.

**Tech Stack:** Go 1.24 (`hub/`), React 18 + TypeScript + Vite (`ui/`), vitest 2
with jsdom and vitest-axe.

Design spec: `docs/history/specs/2026-08-05-hosted-rebuild-and-responsive-header-design.md`.

## Global Constraints

- Branch is `fix/hosted-rebuild-and-responsive-header`, already created off `main`.
- **Commit trailers:** no `Co-Authored-By` and no `Claude-Session` lines on this repo.
- **Go:** run `go test ./... && go vet ./...` from inside `hub/`. Both must pass.
- **UI:** run `npx tsc --noEmit`, `npm run lint`, `npm test` from inside `ui/`, never
  from the repo root — from the root vitest misses `ui/vite.config.ts` and every
  DOM test fails.
- **Do not bump vitest past v2.** It is pinned for vite 5 compatibility.
- All user-facing copy goes in `ui/src/strings.ts`. Static text is a plain string;
  text with runtime values is a function. Never inline a sentence in a component.
- `.app-header`'s `height: 56px` and `flex-shrink: 0` must survive every CSS change;
  `ui/src/styles/layout.test.ts` asserts the second one and the comment at
  `ui/src/theme.css:145` records the regression it prevents.
- The local product (`./sim up`) must stay byte-identical in behaviour. Nothing in
  this plan may add a request that a local facilitator would 404.
- Icons are hand-authored in `ui/src/components/Icon.tsx`. Never use a Unicode
  glyph literal for a functional icon — the bundled fonts declare a `unicode-range`
  that most of them fall outside.

---

## File Structure

**Hub (Go)**

- `hub/internal/api/api.go` — two new error-code constants and a `writeErrorCode`
  helper beside the existing `writeError`.
- `hub/internal/api/proxy.go` — the 502 and 503 bodies gain `code`.
- `hub/internal/session/session.go` — `Session.Op`, populated by `Get`; `StartedAt`
  restamped when a recycle begins rather than partway through it.
- `hub/internal/api/session_test.go` — a stalled-Pod stub and the proxy 503 test.
- `hub/internal/session/session_test.go` — the `Op` and `StartedAt` tests.

**UI — part one**

- `ui/src/api.ts` — `ApiError`, `apiError()`, `isEnvironmentStarting()`, `op` on
  `HostedSession`.
- `ui/src/api.test.ts` — **new.** Unit tests for the error type.
- `ui/src/App.tsx` — the toast rule in `handlePollError`; `useSeatLanding` call.
- `ui/src/lib/useSeatLanding.ts` — **new.** Where a hosted candidate lands when
  their environment comes up.
- `ui/src/screens/HostedBooting.tsx` — rebuild mode.
- `ui/src/strings.ts` — rebuild copy, menu copy.
- `ui/src/screens/Hosted.test.tsx` — rebuild-screen and landing tests.

**UI — part two**

- `ui/src/components/SessionChip.tsx` — split into `SessionChip` (clock),
  `SessionActions` (buttons), `EndSessionDialog` (confirmation).
- `ui/src/components/HeaderMenu.tsx` — **new.** The popover.
- `ui/src/components/HeaderMenu.test.tsx` — **new.**
- `ui/src/components/AppHeader.tsx` — takes a typed `session` prop, owns the
  confirmation dialog, collapses below the breakpoint.
- `ui/src/components/AppHeader.test.tsx` — collapsed-mode cases.
- `ui/src/components/Icon.tsx` — a `menu` glyph.
- `ui/src/lib/useMediaQuery.ts` — `HEADER_COMPACT_QUERY`.
- `ui/src/theme.css` — one breakpoint system, menu styles, desktop grouping.
- `ui/src/a11y.test.tsx` — updated `SessionChip` call site, open menu in the sweep.

---

## Task 1: The hub says which kind of wait a 503 is

**Files:**
- Modify: `hub/internal/api/api.go` (after `writeError`, ~line 401)
- Modify: `hub/internal/api/proxy.go:41-43` and `proxy.go:96-103`
- Test: `hub/internal/api/session_test.go`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the JSON string constants `"environment_starting"` and
  `"environment_unreachable"`, emitted as the `code` field of the proxy's own
  error bodies. Task 4 consumes the first from the browser.

- [ ] **Step 1: Write the failing test**

Append to `hub/internal/api/session_test.go`. It needs `"context"` and `"sync"`
in the import block — add them if absent.

```go
// stalledPods creates Pods that never become ready. That is exactly the
// state the proxy's 503 branch exists for — a session admitted, holding a
// seat, with nowhere to send traffic yet — and it is the state a hosted
// "New attempt" spends its first minutes in, because a reset here is Pod
// replacement.
type stalledPods struct {
	mu   sync.Mutex
	live map[string]bool
}

func (p *stalledPods) Create(_ context.Context, spec []byte) error {
	var pod struct {
		Metadata struct {
			Name string `json:"name"`
		} `json:"metadata"`
	}
	if err := json.Unmarshal(spec, &pod); err != nil {
		return err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.live == nil {
		p.live = map[string]bool{}
	}
	if p.live[pod.Metadata.Name] {
		return session.ErrPodExists
	}
	p.live[pod.Metadata.Name] = true
	return nil
}

func (p *stalledPods) Get(_ context.Context, name string) (session.Pod, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if !p.live[name] {
		return session.Pod{}, session.ErrPodGone
	}
	return session.Pod{Name: name, IP: "10.42.0.9", Phase: "Running", Ready: false}, nil
}

func (p *stalledPods) Delete(_ context.Context, name string) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if !p.live[name] {
		return session.ErrPodGone
	}
	delete(p.live, name)
	return nil
}

func (p *stalledPods) List(context.Context, string) ([]session.Pod, error) {
	return nil, nil
}

// The SPA has to tell an expected wait from an outage, and the sentence
// in the body is copy — the next person to reword it would silently
// break whatever was matching on it.
func TestProxySaysWhetherAWaitIsAWaitOrAFault(t *testing.T) {
	s, _ := newServer(t, auth.ModeGitHub)
	s.Sessions = session.New(&stalledPods{}, session.Config{
		Flavours: map[session.Kind]session.Flavour{
			session.Practical: {Seats: 1, Template: session.Template(podTemplate)},
		},
		Logf: func(string, ...any) {},
	})
	s.DefaultKind = session.Practical

	c := login(t, s, "583231", "octocat")
	start := httptest.NewRequest(http.MethodPost, "/api/session/start", strings.NewReader("{}"))
	start.AddCookie(c)
	if w := do(s, start); w.Code != http.StatusAccepted {
		t.Fatalf("start = %d, want 202", w.Code)
	}

	r := httptest.NewRequest(http.MethodGet, "/api/session", nil)
	r.AddCookie(c)
	w := do(s, r)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", w.Code)
	}
	var body struct {
		Error string `json:"error"`
		Code  string `json:"code"`
		State string `json:"state"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Code != "environment_starting" {
		t.Errorf("code = %q, want environment_starting; body was %q", body.Code, body.Error)
	}
	if body.Error == "" {
		t.Error("the sentence for a person went away — both are wanted, not one or the other")
	}
	if body.State == "" {
		t.Error("state went away; the boot screen reads it")
	}
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd hub && go test ./internal/api/ -run TestProxySaysWhether -v`
Expected: FAIL — `code = "", want environment_starting`.

- [ ] **Step 3: Add the constants and the helper**

In `hub/internal/api/api.go`, immediately after `writeError` (which ends at
line 403):

```go
// Error codes on the proxy's own answers.
//
// The `error` field is a sentence for a person and stays that way. These
// are for the SPA, which has to tell an expected wait from a fault and
// must not do it by matching prose — the copy is a UI string living in a
// Go file, and it will be reworded by someone with no idea a client is
// parsing it.
const (
	codeEnvironmentStarting    = "environment_starting"
	codeEnvironmentUnreachable = "environment_unreachable"
)

func writeErrorCode(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]string{"error": msg, "code": code})
}
```

- [ ] **Step 4: Emit them from the proxy**

In `hub/internal/api/proxy.go`, replace the `ErrorHandler` body's `writeError`
call (line 42) with:

```go
			writeErrorCode(w, http.StatusBadGateway, codeEnvironmentUnreachable,
				"your exam environment is not reachable right now")
```

and replace the 503 write (lines 99-103) with:

```go
		w.Header().Set("Retry-After", "5")
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"error": "your exam environment is still starting",
			"code":  codeEnvironmentStarting,
			"state": live.State,
		})
```

- [ ] **Step 5: Run the test and the package**

Run: `cd hub && go test ./... && go vet ./...`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add hub/internal/api/api.go hub/internal/api/proxy.go hub/internal/api/session_test.go
git commit -m "fix(hub): a wait and a fault should not read the same

The proxy answers a request during a Pod replacement with 503 and a
sentence, and answers an unreachable Pod with 502 and a sentence. The
SPA has to tell those apart and had only the prose to do it with. Both
bodies now carry a code; the sentences are unchanged."
```

---

## Task 2: `/api/me` reports the control op in flight

**Files:**
- Modify: `hub/internal/session/session.go:72-89` (the `Session` struct) and
  `session.go:493-502` (`Manager.Get`)
- Test: `hub/internal/session/session_test.go`

**Interfaces:**
- Consumes: nothing.
- Produces: `Session.Op string` with JSON tag `op,omitempty`, set to `"reset"` or
  `"switch"` while a recycle is in flight and empty otherwise. It reaches the
  browser through `/api/me` because `handleMe` serialises `session.Session`
  directly (`hub/internal/api/api.go:168`). Task 6 branches on it.

- [ ] **Step 1: Write the failing test**

Append to `hub/internal/session/session_test.go`:

```go
// A rebuild is a Pod replacement, and the screen shown while it runs has
// to be able to say so. Without this the only signal is "not ready",
// which is also exactly what a first boot looks like — so the candidate
// who pressed "New attempt" got a screen welcoming them to a new
// environment and offering to give their seat up.
func TestGetReportsTheControlOpWhileARebuildRuns(t *testing.T) {
	m, pods := newManager(t, 1, nil)
	if _, err := m.Start(context.Background(), "583231", Practical, ""); err != nil {
		t.Fatal(err)
	}
	waitReady(t, m, "583231")

	if s, _ := m.Get("583231"); s.Op != "" {
		t.Errorf("op = %q on a settled session, want empty", s.Op)
	}

	// Hold the replacement un-ready so the recycle stays in flight for the
	// length of this test rather than racing it.
	name := pods.created[0]
	pods.mu.Lock()
	pods.notReady[name] = true
	pods.mu.Unlock()

	if _, err := m.Recycle("583231", ""); err != nil {
		t.Fatal(err)
	}

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		s, err := m.Get("583231")
		if err == nil && s.Op == "reset" {
			if s.Addr() != "" {
				t.Errorf("addr = %q mid-rebuild, want empty", s.Addr())
			}
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("Get never reported the reset in flight")
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd hub && go test ./internal/session/ -run TestGetReportsTheControlOp -v`
Expected: FAIL — `s.Op` undefined (compile error).

- [ ] **Step 3: Add the field**

In `hub/internal/session/session.go`, inside `type Session struct`, after the
`Error` field (line 79):

```go
	// Op is the control operation running against this session right now
	// — "reset" or "switch" — and empty when there is none.
	//
	// On the session rather than left to GET /api/control/status because
	// of who asks and when. The SPA polls /api/me every 2s while a session
	// is not ready, and this is the field that lets the screen shown
	// during that wait tell a first boot from a rebuild the candidate
	// asked for. It is server truth, so it survives a reload mid-rebuild,
	// which a remembered click would not.
	Op string `json:"op,omitempty"`
```

- [ ] **Step 4: Populate it in Get**

Replace `Manager.Get` (`session.go:493-502`) with:

```go
// Get returns a user's session.
func (m *Manager) Get(user string) (Session, error) {
	m.mu.Lock()
	e, ok := m.sessions[user]
	if !ok {
		m.mu.Unlock()
		return Session{}, ErrNoSession
	}
	out := e.Session
	m.mu.Unlock()
	// Deliberately read outside m.mu. The job store has a lock of its own
	// and nothing that holds it ever reaches for m.mu, so nesting the two
	// here would make this the first place in the package that could
	// deadlock — for no gain, since `out` is already a copy.
	if snap := e.jobs.snapshot(); snap.Busy && snap.Job != nil {
		out.Op = snap.Job.Op
	}
	return out, nil
}
```

- [ ] **Step 5: Run the tests**

Run: `cd hub && go test ./... && go vet ./...`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add hub/internal/session/session.go hub/internal/session/session_test.go
git commit -m "feat(hub): a session says when it is being rebuilt

A recycled Pod is not ready, and neither is one that has never been
built. Every screen that waits on a hosted session had only that one bit
to go on, so a candidate who asked for another attempt was shown a first
boot."
```

---

## Task 3: The rebuild's clock starts when the rebuild does

**Files:**
- Modify: `hub/internal/session/session.go:567-595` (`Recycle`) and
  `session.go:624-633` (the `start` phase of `runRecycle`)
- Test: `hub/internal/session/session_test.go`

**Interfaces:**
- Consumes: nothing.
- Produces: `Session.StartedAt` is restamped when `Recycle` accepts the job, not
  when the replacement Pod is created. Task 6's elapsed counter depends on it.

**Why:** `runRecycle` restamps `StartedAt` in its `start` phase, which is after
the old Pod is deleted and drained. The boot screen computes its elapsed counter
from `StartedAt`, so during the whole `stop` phase it would count from the
session's original start — a rebuild reading "4:21:07 so far" thirty seconds in.

- [ ] **Step 1: Write the failing test**

Append to `hub/internal/session/session_test.go`:

```go
// The boot screen's elapsed counter is (now - StartedAt), and a rebuild
// shows that screen. Restamping only once the old Pod has drained meant
// the first phase of every rebuild counted from the session's original
// start — hours, on a long seat.
func TestRecycleRestampsTheClockWhenItBeginsNotWhenThePodIsRecreated(t *testing.T) {
	m, pods := newManager(t, 1, nil)
	if _, err := m.Start(context.Background(), "583231", Practical, ""); err != nil {
		t.Fatal(err)
	}
	waitReady(t, m, "583231")

	before, _ := m.Get("583231")

	// Never ready, so the recycle cannot reach its start phase and any
	// restamping observed below is the one Recycle itself did.
	pods.mu.Lock()
	pods.notReady[pods.created[0]] = true
	pods.mu.Unlock()

	if _, err := m.Recycle("583231", ""); err != nil {
		t.Fatal(err)
	}

	after, err := m.Get("583231")
	if err != nil {
		t.Fatal(err)
	}
	if !after.StartedAt.After(before.StartedAt) {
		t.Errorf("startedAt = %v, want later than the original %v", after.StartedAt, before.StartedAt)
	}
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd hub && go test ./internal/session/ -run TestRecycleRestampsTheClock -v`
Expected: FAIL — `startedAt = <original>, want later than the original`.

- [ ] **Step 3: Restamp in Recycle**

In `hub/internal/session/session.go`, inside `Recycle`, replace the block that
begins the job (lines 588-594) with:

```go
	j, ok := e.jobs.begin(op, bank, phases)
	if !ok {
		return Job{}, ErrBusy
	}

	// The clock the boot screen counts from. It used to be restamped in
	// the start phase, i.e. after the old Pod had been deleted and
	// drained, so the first stretch of every rebuild counted from the
	// session's original start. ExpiresAt stays where it is: it is the
	// lease, and extending it a few seconds earlier is a different
	// decision from fixing a displayed counter.
	m.mu.Lock()
	e.StartedAt = m.now()
	m.mu.Unlock()

	go m.runRecycle(e, fl, bank)
	return j, nil
```

- [ ] **Step 4: Drop the duplicate restamp**

In `runRecycle`'s `start` phase (`session.go:624-633`), replace:

```go
		now := m.now()
		e.StartedAt, e.LastSeen = now, now
		e.ExpiresAt = now.Add(m.cfg.MaxAge)
```

with:

```go
		// StartedAt is not touched here: Recycle stamped it when the job
		// was accepted, which is when the wait the candidate is watching
		// actually began.
		now := m.now()
		e.LastSeen = now
		e.ExpiresAt = now.Add(m.cfg.MaxAge)
```

- [ ] **Step 5: Run the tests**

Run: `cd hub && go test ./... && go vet ./...`
Expected: PASS, including `TestRecycleReplacesThePodAndReportsPhases`.

- [ ] **Step 6: Commit**

```bash
git add hub/internal/session/session.go hub/internal/session/session_test.go
git commit -m "fix(hub): a rebuild's clock started after the wait it measures

StartedAt was restamped once the old Pod had drained, which is a phase
into the job. The screen that counts from it spent that phase reporting
the age of the session being replaced."
```

---

## Task 4: `ApiError` carries the status and the code

**Files:**
- Modify: `ui/src/api.ts:401-412` and all 20 `throw new Error(await readError(res))` sites
- Modify: `ui/src/api.ts:1251-1261` (`HostedSession`)
- Test: `ui/src/api.test.ts` (**create**)

**Interfaces:**
- Consumes: the `code` field from Task 1.
- Produces:
  - `export class ApiError extends Error` with `readonly status: number` and
    `readonly code?: string`.
  - `export function isEnvironmentStarting(err: unknown): boolean`
  - `HostedSession.op?: "reset" | "switch"` (from Task 2's JSON).
  - `String(err)` on a thrown API error is byte-identical to today.

- [ ] **Step 1: Write the failing test**

Create `ui/src/api.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { ApiError, isEnvironmentStarting } from "./api";

describe("ApiError", () => {
  // Everything that renders one of these renders `${err}`, and the
  // toast copy is asserted elsewhere by its full text. Setting `name`
  // would silently reword every one of them.
  test("stringifies exactly as a plain Error does", () => {
    const err = new ApiError(503, "your exam environment is still starting", "environment_starting");
    expect(String(err)).toBe("Error: your exam environment is still starting");
  });

  test("keeps the parts a caller branches on", () => {
    const err = new ApiError(503, "still starting", "environment_starting");
    expect(err.status).toBe(503);
    expect(err.code).toBe("environment_starting");
    expect(err instanceof Error).toBe(true);
  });

  test("recognises the hub's Pod-replacement wait and nothing else", () => {
    expect(isEnvironmentStarting(new ApiError(503, "x", "environment_starting"))).toBe(true);
    expect(isEnvironmentStarting(new ApiError(502, "x", "environment_unreachable"))).toBe(false);
    expect(isEnvironmentStarting(new ApiError(500, "x"))).toBe(false);
    expect(isEnvironmentStarting(new Error("your exam environment is still starting"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd ui && npm test -- src/api.test.ts`
Expected: FAIL — `ApiError` is not exported from `./api`.

- [ ] **Step 3: Add the type and the helper**

In `ui/src/api.ts`, replace the block at lines 401-412 with:

```ts
interface ApiErrorBody {
  error: string;
  code?: string;
}

/**
 * An HTTP error from the API, with the machine-readable parts kept.
 *
 * `name` is deliberately left as "Error", so `String(err)` is unchanged
 * and every call site that renders one reads exactly as it did. What is
 * added is `code`: the hub answers a proxied request with 503
 * `environment_starting` for the minutes it spends replacing a session
 * Pod, and that is an expected wait rather than a fault — a distinction
 * no amount of reading the sentence can make safely.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** The hub's answer while a session Pod is being replaced. */
export const ENVIRONMENT_STARTING = "environment_starting";

export function isEnvironmentStarting(err: unknown): boolean {
  return err instanceof ApiError && err.code === ENVIRONMENT_STARTING;
}

/**
 * The error a failed response should throw.
 *
 * readError stays beside it and is still used: the `{ ok: false, error }`
 * call sites want the sentence and nothing else.
 */
async function apiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    return new ApiError(res.status, body.error || `HTTP ${res.status}`, body.code);
  } catch {
    return new ApiError(res.status, `HTTP ${res.status}`);
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    return body.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}
```

- [ ] **Step 4: Route every throwing site through it**

All 20 sites are the identical string `throw new Error(await readError(res));`
(plus one single-line variant at `api.ts:1344`). Replace them:

```bash
cd ui && perl -pi -e 's/throw new Error\(await readError\(res\)\);/throw await apiError(res);/g' src/api.ts
```

- [ ] **Step 5: Add `op` to the hosted session type**

In `ui/src/api.ts`, inside `export interface HostedSession` (line 1251), after
`error?: string;`:

```ts
  /**
   * The control operation running against this session right now. Set by
   * the hub while it replaces the Pod, which is what a hosted reset or
   * exam switch is. Absent means nothing is running — including on a
   * first boot, which is the distinction this exists to draw.
   */
  op?: "reset" | "switch";
```

- [ ] **Step 6: Run the checks**

Run: `cd ui && npx tsc --noEmit && npm run lint && npm test`
Expected: PASS. `readError` is still referenced by the `{ ok: false, error }`
sites, so no unused-symbol lint error.

- [ ] **Step 7: Commit**

```bash
git add ui/src/api.ts ui/src/api.test.ts
git commit -m "feat(ui): API failures keep their status and their code

Every failed request threw a bare Error carrying the server's sentence
and nothing else, so a caller wanting to tell an expected wait from a
fault had only the prose. String(err) is unchanged."
```

---

## Task 5: The toast stops firing on a rebuild the app asked for

**Files:**
- Modify: `ui/src/App.tsx:278-285` (`handlePollError`)
- Test: `ui/src/screens/Hosted.test.tsx`

**Interfaces:**
- Consumes: `isEnvironmentStarting` from Task 4; `wasBusy` (a `useRef(false)`
  already declared at `App.tsx:210`, set to `true` optimistically by
  `applyControlResult` at `App.tsx:405`).
- Produces: no new exports. `pollError` state is still set on every failure, so
  the pre-first-session loading screen at `App.tsx:583` is unaffected.

- [ ] **Step 1: Write the failing test**

Append to `ui/src/screens/Hosted.test.tsx`. It reuses that file's existing
`me()`, `stubFetch()`, `identity` and `localStubs`.

```ts
/** A ready hosted seat, so SimApp mounts and its session poller runs. */
function readySeat() {
  return {
    kind: "practical" as const,
    bank: "ckad-mock-01",
    pod: "sim-session-practical-583231",
    state: "ready" as const,
    startedAt: new Date(now - 600_000).toISOString(),
    expiresAt: new Date(now + 2 * 3600_000).toISOString(),
    lastSeen: new Date(now).toISOString(),
  };
}

// The reported bug, in the window it actually happens in.
//
// SimApp has to be MOUNTED and its session poller running, because that
// poller is what raises the toast. /api/me flips to "pending" about two
// seconds after the POST and unmounts SimApp — but a toast pushed before
// then lives in a module singleton and outlives it. So the fixture holds
// /api/me at "ready" while the proxy has already started answering 503,
// which is exactly the race.
test("a Pod replacement raises no outage toast", async () => {
  identity = me({ session: readySeat() });
  render(<App />);
  await screen.findByRole("heading", { name: /path to kubestronaut/i });

  // The hub begins replacing the Pod. Every proxied request is a 503 from
  // here on; /api/me has not caught up.
  localStubs["/api/session"] = null;
  window.dispatchEvent(new Event("focus")); // pollSession re-fetches on focus

  await waitFor(() => {
    expect(screen.queryByText(/cannot reach facilitator/i)).toBeNull();
  });
});

// The other half, and the reason the guard is a code and not a blanket
// mute: a facilitator that has genuinely fallen over must still say so.
test("a real failure still raises the toast", async () => {
  identity = me({ session: readySeat() });
  render(<App />);
  await screen.findByRole("heading", { name: /path to kubestronaut/i });

  localStubs["/api/session"] = "boom"; // forces the 500 branch in stubFetch
  window.dispatchEvent(new Event("focus"));

  expect(await screen.findByText(/cannot reach facilitator/i)).toBeInTheDocument();
});
```

Add the 503 branch to that file's `stubFetch`, immediately before the
`localStubs` loop:

```ts
      // Two failure fixtures for the session poll, opted into by writing
      // a sentinel into localStubs. `null` is the hub's answer while it
      // replaces a Pod — an expected wait. "boom" is a facilitator that
      // has actually fallen over, which must still be reported.
      if (url.endsWith("/api/session")) {
        if (localStubs["/api/session"] === null) {
          return json(
            {
              error: "your exam environment is still starting",
              code: "environment_starting",
              state: "pending",
            },
            503,
          );
        }
        if (localStubs["/api/session"] === "boom") {
          return json({ error: "the facilitator is not answering" }, 500);
        }
      }
```

and restore the stub in that file's `beforeEach`, after `identity = me();`:

```ts
  localStubs["/api/session"] = readySessionStub;
```

where `readySessionStub` is a new module-level const holding the object
currently written inline at `localStubs["/api/session"]`:

```ts
/** A settled idle session, as the facilitator reports one. */
const readySessionStub = {
  state: "idle",
  bank: "ckad-mock-01",
  startedAt: "",
  durationSeconds: 7200,
  remainingSeconds: 0,
  endReason: "",
  mode: "exam",
  untimed: false,
};
```

and `localStubs["/api/session"]` becomes `readySessionStub`.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd ui && npm test -- src/screens/Hosted.test.tsx -t "outage toast"`
Expected: the "no outage toast" test FAILS — the toast is found. The "a real
failure still raises the toast" test PASSES already, which is the point: it is
the control, and it must stay green through the fix.

- [ ] **Step 3: Import the guard**

In `ui/src/App.tsx`, add `isEnvironmentStarting` to the existing import from
`./api`.

- [ ] **Step 4: Teach handlePollError the difference**

Replace `handlePollError` (`App.tsx:278-285`) with:

```tsx
  const handlePollError = useCallback((err: unknown) => {
    setPollError(String(err));
    if (!seenSession.current) return;
    // Two ways to know this is not a fault, and both are wanted.
    //
    // The hub answers every proxied request with 503 environment_starting
    // while it replaces a session Pod, and a hosted "New attempt" IS a Pod
    // replacement. That is the durable signal: it survives a reload
    // landing mid-rebuild, where nothing in this tab remembers a click.
    //
    // A control job in flight covers the rest — the window between the
    // 202 and /api/me reporting it, and the LOCAL product, where a reset
    // restarts the facilitator in place and the poll fails for exactly
    // the same non-reason. The overlay is already narrating it; a warning
    // toast over the top says the thing the candidate asked for has gone
    // wrong.
    //
    // pollError is set above either way, so the pre-first-session loading
    // screen keeps its message.
    if (isEnvironmentStarting(err) || wasBusy.current) return;
    pollToastId.current = toastStore.push({
      kind: "warning",
      message: strings.app.cannotReach(String(err)),
      dedupeKey: "session-poll",
    });
  }, []);
```

- [ ] **Step 5: Run the whole UI suite**

Run: `cd ui && npx tsc --noEmit && npm run lint && npm test`
Expected: PASS, both new tests included.

- [ ] **Step 6: Commit**

```bash
git add ui/src/App.tsx
git commit -m "fix(ui): the session poll stopped calling a rebuild an outage

A hosted New attempt replaces the Pod, so the poll gets a 503 for
minutes. It was reported as a warning about reaching the facilitator —
about the rebuild the app itself had just requested."
```

---

## Task 6: The boot screen tells a rebuild from a first boot

**Files:**
- Modify: `ui/src/screens/HostedBooting.tsx`
- Modify: `ui/src/strings.ts` (the `hosted` block, after `bootGiveUp` at line 1550)
- Test: `ui/src/screens/Hosted.test.tsx` (the test from Task 5 goes green here)

**Interfaces:**
- Consumes: `HostedSession.op` from Task 4.
- Produces: no new exports. New copy keys: `strings.hosted.rebuildTitle`,
  `rebuildBody(exam?: string)`, `rebuildGiveUp`.

- [ ] **Step 1: Add the copy**

In `ui/src/strings.ts`, in the `hosted` block immediately after
`bootGiveUp: "Give up this seat",` (line 1550):

```ts
    // A rebuild, not a first boot. The same wait, a different fact: this
    // candidate already has a seat and asked for another attempt, so copy
    // that welcomes them to a new environment and offers to give the seat
    // up is describing somebody else's situation entirely.
    rebuildTitle: "Rebuilding your environment",
    // Named when the exam is known, because a candidate mid-rebuild wants
    // to be sure it is being rebuilt as the exam they were sitting.
    rebuildBody: (exam?: string) =>
      exam
        ? `Your last attempt is being cleared and a clean ${exam} environment built in its place. This takes a few minutes, and nothing is lost if you close this tab.`
        : "Your last attempt is being cleared and a clean environment built in its place. This takes a few minutes, and nothing is lost if you close this tab.",
    // Says what it does. "Give up this seat" during a rebuild reads as
    // "cancel the rebuild", which is not what the button does — it ends
    // the session and hands the seat back to the pool.
    rebuildGiveUp: "End session and free the seat",
```

- [ ] **Step 2: Write the failing assertions**

Append to `ui/src/screens/Hosted.test.tsx`:

```ts
// The rebuild screen names the exam and offers the honest way out. A
// first boot must be untouched by all of this.
test("a rebuild says so, and a first boot still reads as a first boot", async () => {
  hubExams = [
    {
      id: "ckad-mock-01",
      title: "CKAD Mock Exam 01",
      certification: "CKAD",
      examType: "hands-on",
      kind: "practical",
      available: true,
      nodes: 2,
      questionCount: 22,
    },
  ];
  const booting = {
    kind: "practical" as const,
    bank: "ckad-mock-01",
    pod: "sim-session-practical-583231",
    state: "starting" as const,
    startedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 3_600_000).toISOString(),
    lastSeen: new Date(now).toISOString(),
  };

  identity = me({ session: { ...booting, op: "reset" } });
  const rebuild = render(<App />);
  await screen.findByRole("heading", { name: strings.hosted.rebuildTitle });
  expect(screen.getByText(/clean CKAD environment/i)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: strings.hosted.rebuildGiveUp }),
  ).toBeInTheDocument();
  rebuild.unmount();

  identity = me({ session: booting });
  render(<App />);
  await screen.findByRole("heading", { name: strings.hosted.bootStartingTitle });
  expect(
    screen.getByRole("button", { name: strings.hosted.bootGiveUp }),
  ).toBeInTheDocument();
});
```

Add `import { strings } from "../strings";` to that file if it is not already
imported.

- [ ] **Step 3: Run and watch it fail**

Run: `cd ui && npm test -- src/screens/Hosted.test.tsx -t "a rebuild says so"`
Expected: FAIL — no heading named "Rebuilding your environment".

- [ ] **Step 4: Branch the screen**

In `ui/src/screens/HostedBooting.tsx`, after the `const exam = …` line (line 42),
add:

```tsx
  // The hub says what it is doing to this Pod. Without it "not ready" is
  // the only signal, and a first boot and a rebuild are indistinguishable
  // — which is how the candidate who pressed "New attempt" ended up on a
  // screen written to greet them.
  const rebuilding = session.op === "reset" || session.op === "switch";
```

Then replace the `title` and `body` derivation (lines 88-97) with:

```tsx
  const pending = session.state === "pending";
  const title = rebuilding
    ? strings.hosted.rebuildTitle
    : pending
      ? strings.hosted.bootPendingTitle
      : strings.hosted.bootStartingTitle;
  // The queue reads the same whatever is being queued for; the build does
  // not. A multiple-choice seat has no cluster to build and is up in
  // seconds, so the hands-on copy would be describing someone else's wait.
  //
  // A rebuild outranks both: it is the same work as a first build, but
  // the sentence a candidate needs is what is happening to the attempt
  // they just finished, not what a new environment contains.
  const body = rebuilding
    ? strings.hosted.rebuildBody(exam?.certification || exam?.title)
    : pending
      ? strings.hosted.bootPendingBody
      : session.kind === "mcq"
        ? strings.hosted.bootStartingBodyMcq
        : strings.hosted.bootStartingBody(exam?.nodes, exam?.questionCount);
```

Then wrap the title in a heading role — it already is an `<h1>` — and replace
the give-up button (lines 122-124) with:

```tsx
      <button type="button" className="btn" onClick={() => void giveUp()} disabled={busy}>
        {rebuilding ? strings.hosted.rebuildGiveUp : strings.hosted.bootGiveUp}
      </button>
```

- [ ] **Step 5: Run the suite**

Run: `cd ui && npx tsc --noEmit && npm run lint && npm test`
Expected: PASS, including Task 5's "no outage toast" test.

- [ ] **Step 6: Commit**

```bash
git add ui/src/screens/HostedBooting.tsx ui/src/strings.ts ui/src/screens/Hosted.test.tsx
git commit -m "fix(ui): a rebuild is not a first boot and should not read as one

A candidate who pressed New attempt was shown the screen that welcomes
someone to a new environment, with a button offering to give up the seat
they had just asked to keep using."
```

---

## Task 7: Landing somewhere deliberate when the environment comes up

**Files:**
- Create: `ui/src/lib/useSeatLanding.ts`
- Modify: `ui/src/App.tsx:93-96` (the `App` component's opening)
- Test: `ui/src/screens/Hosted.test.tsx`

**Interfaces:**
- Consumes: `HostedState` from `./useHosted`; `navigate` from `./useHashRoute`.
- Produces: `export function useSeatLanding(state: HostedState): void`.

- [ ] **Step 1: Write the failing test**

Append to `ui/src/screens/Hosted.test.tsx`:

```ts
// A hosted seat is scoped to one exam — the Pod is stamped and sized for
// it — so the picker at the end of a boot has one card on it and asks the
// candidate to re-confirm what they chose in the lobby. After a rebuild
// it reads as having been thrown out of the attempt they asked to repeat.
test("an environment that comes up lands on its exam, not on the picker", async () => {
  identity = me({
    session: {
      kind: "practical",
      bank: "ckad-mock-01",
      pod: "sim-session-practical-583231",
      state: "starting",
      op: "reset",
      startedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 3_600_000).toISOString(),
      lastSeen: new Date(now).toISOString(),
    },
  });
  render(<App />);
  await screen.findByRole("heading", { name: strings.hosted.rebuildTitle });

  identity = me({
    session: {
      kind: "practical",
      bank: "ckad-mock-01",
      pod: "sim-session-practical-583231",
      state: "ready",
      startedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 3_600_000).toISOString(),
      lastSeen: new Date(now).toISOString(),
    },
  });

  await waitFor(() => {
    expect(window.location.hash).toBe("#/exams/ckad-mock-01/mode");
  });
});

// A tab that was already on a ready session is not mid-anything, and
// yanking it to the mode screen would lose whatever the candidate was
// reading.
test("a page load into a ready seat is left where it is", async () => {
  window.location.hash = "#/progress";
  identity = me({
    session: {
      kind: "practical",
      bank: "ckad-mock-01",
      pod: "sim-session-practical-583231",
      state: "ready",
      startedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 3_600_000).toISOString(),
      lastSeen: new Date(now).toISOString(),
    },
  });
  render(<App />);
  await waitFor(() => expect(window.location.hash).toBe("#/progress"));
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd ui && npm test -- src/screens/Hosted.test.tsx -t "lands on its exam"`
Expected: FAIL — hash stays `#/` (or whatever the previous test left).

- [ ] **Step 3: Write the hook**

Create `ui/src/lib/useSeatLanding.ts`:

```ts
import { useEffect, useRef } from "react";
import { navigate } from "./useHashRoute";
import type { HostedState } from "./useHosted";

/**
 * Where a hosted candidate lands when their environment comes up.
 *
 * A hosted seat is scoped to one exam: the Pod is stamped and sized for
 * it, and the selector inside the session offers no other. So the exam
 * picker at the end of a boot is a screen with a single card on it,
 * asking the candidate to re-confirm the choice they made in the lobby —
 * and at the end of a rebuild it reads as having been thrown out of the
 * attempt they asked to repeat.
 *
 * Two guards, and both matter:
 *
 *   - It fires only on a transition into ready that this tab WATCHED. A
 *     page load that finds a session already ready is not mid-anything,
 *     and moving it would take a candidate off whatever they had open.
 *   - It yields to a route they are deliberately on. Progress and a past
 *     attempt are about their record rather than their environment, and a
 *     rebuild finishing behind them must not close what they are reading.
 *
 * Mode.tsx bounces to /exams when the facilitator's active exam is not
 * the bank in the route, so a wrong guess here costs exactly the screen
 * this replaces and nothing more.
 */
export function useSeatLanding(state: HostedState): void {
  const seen = useRef(false);
  const wasReady = useRef(false);

  useEffect(() => {
    const session = state.status === "hosted" ? state.me.session : undefined;
    const ready = session?.state === "ready";
    const bank = session?.bank;

    // The first observation establishes a baseline and never navigates.
    if (!seen.current) {
      seen.current = true;
      wasReady.current = ready;
      return;
    }
    const arrived = ready && !wasReady.current;
    wasReady.current = ready;
    if (!arrived || !bank) return;

    const here = window.location.hash.replace(/^#\/?/, "").split("/")[0];
    if (here === "progress" || here === "history" || here === "exams") return;
    navigate(`/exams/${bank}/mode`, { replace: true });
  }, [state]);
}
```

- [ ] **Step 4: Call it**

In `ui/src/App.tsx`, add the import:

```tsx
import { useSeatLanding } from "./lib/useSeatLanding";
```

and call it inside `App`, immediately after `const route = useRoute();` (line 95):

```tsx
  // Before the gate below, not inside a branch: hooks may not be
  // conditional, and this one has to keep watching across every state the
  // gate switches between.
  useSeatLanding(state);
```

- [ ] **Step 5: Run the suite**

Run: `cd ui && npx tsc --noEmit && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/src/lib/useSeatLanding.ts ui/src/App.tsx ui/src/screens/Hosted.test.tsx
git commit -m "feat(ui): a seat that comes up lands on its exam

The picker at the end of a hosted boot holds one card, because the seat
is the exam. After a rebuild it read as being thrown out of the attempt
the candidate had just asked to repeat."
```

---

## Task 8: The header owns the End-session confirmation

**Files:**
- Modify: `ui/src/components/SessionChip.tsx` (split into three exports)
- Modify: `ui/src/components/AppHeader.tsx` (new `session` prop, owns the dialog)
- Modify: `ui/src/App.tsx:169-175` and `App.tsx:653-681` (the two call sites)
- Modify: `ui/src/a11y.test.tsx:841` (the `SessionChip` call site)
- Test: `ui/src/components/AppHeader.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `SessionChip({ login, session }: { login: string; session?: HostedSession })` —
    the clock only, no buttons, no dialog.
  - `SessionActions({ session, onEnd }: { session?: HostedSession; onEnd: () => void })` —
    the two buttons.
  - `EndSessionDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void })`.
  - `AppHeaderProps.session?: { login: string; session?: HostedSession; onChanged: () => void }`.

**Why:** Task 10 puts the session buttons inside a popover that unmounts when it
closes. A confirmation dialog rendered by those buttons would be destroyed by the
very click that opens it. The state has to live above both, and the header is the
lowest component that contains both.

There is no visual change in this task. The desktop header renders identically.

- [ ] **Step 1: Write the failing test**

Append to `ui/src/components/AppHeader.test.tsx`, inside the outer `describe`:

```tsx
  describe("session", () => {
    const liveSession = {
      kind: "practical" as const,
      bank: "ckad-mock-01",
      pod: "sim-session-practical-583231",
      state: "ready" as const,
      startedAt: "2026-08-05T09:00:00Z",
      expiresAt: "2026-08-05T19:00:00Z",
      lastSeen: "2026-08-05T09:00:00Z",
    };

    test("carries the login, the countdown and both ways out", () => {
      renderHeader(
        <AppHeader session={{ login: "octocat", session: liveSession, onChanged: () => {} }} />,
      );
      expect(screen.getByText("octocat")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: strings.hosted.endSession }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: strings.hosted.signOut })).toBeInTheDocument();
    });

    // The dialog has to be a sibling of the controls that raise it, not a
    // child. Task 10 puts those controls inside a popover that unmounts on
    // close, and a dialog underneath them would go with it.
    test("raises the confirmation from the header, not from the button", async () => {
      const user = userEvent.setup();
      renderHeader(
        <AppHeader session={{ login: "octocat", session: liveSession, onChanged: () => {} }} />,
      );
      await user.click(screen.getByRole("button", { name: strings.hosted.endSession }));
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent(strings.hosted.endConfirmTitle);
      expect(screen.getByRole("banner").contains(dialog)).toBe(false);
    });

    test("shows only sign-out when there is no environment", () => {
      renderHeader(<AppHeader session={{ login: "octocat", onChanged: () => {} }} />);
      expect(screen.getByRole("button", { name: strings.hosted.signOut })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: strings.hosted.endSession })).toBeNull();
    });
  });
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd ui && npm test -- src/components/AppHeader.test.tsx`
Expected: FAIL — `AppHeader` has no `session` prop.

- [ ] **Step 3: Split SessionChip**

Replace the whole of `ui/src/components/SessionChip.tsx` with:

```tsx
import { useState } from "react";
import { endHostedSession, logout, type HostedSession } from "../api";
import { Dialog } from "./Dialog";
import { formatClock } from "../lib/format";
import { useTick } from "../lib/useTick";
import { strings } from "../strings";

/** Under this much lease left, the countdown starts insisting. */
const SOON_SECONDS = 15 * 60;

/**
 * Who you are and how long you have.
 *
 * The countdown is the part that earns its place: a hosted session has a
 * hard cap and is taken back at it whatever the candidate is doing, so
 * the one thing they cannot be left to guess is how long that is. It is
 * recomputed from the server's `expiresAt` on every tick rather than
 * decremented, so a throttled background tab resyncs instead of drifting.
 *
 * Presentational, and deliberately so. The controls that used to sit
 * beside it are SessionActions below, and the confirmation they raise is
 * owned by the header — because on a narrow viewport those controls live
 * inside a popover that unmounts when it closes, and a dialog rendered
 * underneath them would be destroyed by the click that opened it.
 */
export function SessionChip({
  login,
  session,
}: {
  login: string;
  session?: HostedSession;
}) {
  const expires = session ? Date.parse(session.expiresAt) : NaN;
  const live = session !== undefined && !Number.isNaN(expires);
  const now = useTick(live);
  const secondsLeft = live ? Math.max(0, Math.round((expires - now) / 1000)) : 0;
  const soon = live && secondsLeft <= SOON_SECONDS;

  return (
    <div className="session-chip">
      <span className="session-chip-user">{login}</span>
      {live && (
        <span
          className="session-chip-clock"
          data-soon={soon || undefined}
          // Announced only when it starts mattering. A clock in a live
          // region that re-reads every second is unusable with a screen
          // reader on, and for most of a ten-hour lease it is not news.
          role={soon ? "status" : undefined}
        >
          {secondsLeft === 0
            ? strings.hosted.chipExpired
            : soon
              ? strings.hosted.chipEndingSoon(formatClock(secondsLeft))
              : strings.hosted.chipTimeLeft(formatClock(secondsLeft))}
        </span>
      )}
    </div>
  );
}

// A full reload rather than a state update. Signing out invalidates a
// cookie that every open fetch and the desktop's WebSocket are carrying,
// and there is no partial version of that.
async function signOut() {
  await logout().catch(() => undefined);
  window.location.assign("/");
}

/**
 * The two ways out.
 *
 * `onEnd` raises the confirmation rather than performing anything: see
 * SessionChip above for why the dialog cannot live here.
 */
export function SessionActions({
  session,
  onEnd,
}: {
  session?: HostedSession;
  onEnd: () => void;
}) {
  return (
    <>
      {session && (
        <button type="button" className="btn btn-quiet" onClick={onEnd}>
          {strings.hosted.endSession}
        </button>
      )}
      <button type="button" className="btn btn-quiet" onClick={() => void signOut()}>
        {strings.hosted.signOut}
      </button>
    </>
  );
}

/** The confirmation, and the call it makes if confirmed. */
export function EndSessionDialog({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const end = async () => {
    setBusy(true);
    setError(null);
    const result = await endHostedSession();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
    onChanged();
  };

  return (
    <Dialog title={strings.hosted.endConfirmTitle} onClose={onClose}>
      <p>{strings.hosted.endConfirmBody}</p>
      {error && <p className="error-text">{strings.hosted.endFailed(error)}</p>}
      <div className="confirm-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          {strings.hosted.endCancel}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => void end()}
          disabled={busy}
        >
          {strings.hosted.endConfirm}
        </button>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 4: Give AppHeader the session prop**

In `ui/src/components/AppHeader.tsx`:

Add to the imports:

```tsx
import { useState } from "react";
import type { HostedSession } from "../api";
import { EndSessionDialog, SessionActions, SessionChip } from "./SessionChip";
```

Add to `AppHeaderProps`, before `children`:

```tsx
  /**
   * Hosted only: the lease clock and the two ways out.
   *
   * A typed prop rather than more `children` because the header has to
   * know which of the things it carries collapse into the menu on a
   * narrow viewport and which stay in the bar — and because the
   * confirmation the End control raises has to be rendered here, outside
   * that menu, to survive it closing.
   */
  session?: { login: string; session?: HostedSession; onChanged: () => void };
```

Change the `children` doc comment to:

```tsx
  /**
   * Ambient status that never collapses — today the backgrounded-rebuild
   * chip, which must be visible on every screen it can reach or a 2-4
   * minute teardown happens behind an idle-looking page.
   */
  children?: ReactNode;
```

Add `session` to the destructured params, and at the top of the function body:

```tsx
  // Owned here, not by the control that raises it. See SessionChip.
  const [confirming, setConfirming] = useState(false);
```

Render the chip and actions in `.app-header-tail`, before `{children}`:

```tsx
      <div className="app-header-tail">
        {session && (
          <>
            <SessionChip login={session.login} session={session.session} />
            <SessionActions session={session.session} onEnd={() => setConfirming(true)} />
          </>
        )}
        {children}
```

and render the dialog after the closing `</header>`, wrapping the whole return in
a fragment:

```tsx
  return (
    <>
      <header className={`app-header app-header-${variant}`}>
        …unchanged…
      </header>
      {confirming && session && (
        <EndSessionDialog
          onClose={() => setConfirming(false)}
          onChanged={session.onChanged}
        />
      )}
    </>
  );
```

- [ ] **Step 5: Update the two call sites**

In `ui/src/App.tsx`, replace lines 169-175 (`HostedHome`) with:

```tsx
      <AppHeader
        {...headerProps}
        session={{ login: me.user?.login ?? "", session: me.session, onChanged: refresh }}
      />
```

and in `SimApp` replace the `{hosted && (<SessionChip … />)}` block (lines
664-671) by moving it to a prop on the `AppHeader` opening tag:

```tsx
        <AppHeader
          {...headerProps}
          // Hosted only. It carries the lease countdown, which is the one
          // thing about a hosted session a candidate cannot be left to
          // guess: the seat is taken back at the cap whatever they are
          // doing. Deliberately NOT rendered over a running exam — that
          // screen has its own topbar with its own clock, and a second
          // countdown beside it would be read as the exam's. One good
          // consequence and one recorded cost: there is no way to destroy
          // an environment mid-attempt by misclick, and a lease that
          // expires mid-attempt gives no warning. See docs/follow-ups.md.
          session={
            hosted
              ? {
                  login: hosted.me.user?.login ?? "",
                  session: hosted.me.session,
                  onChanged: hosted.refresh,
                }
              : undefined
          }
        >
```

leaving the `{backgroundedJob && <BackgroundJobChip … />}` block as the only
child. Remove the now-unused `SessionChip` import from `App.tsx`.

- [ ] **Step 6: Update the a11y call site**

In `ui/src/a11y.test.tsx`, the `SessionChip` render at line 841 passes
`onChanged`. Drop that prop — the component no longer takes it — and leave
`login` and `session` as they are.

- [ ] **Step 7: Run everything**

Run: `cd ui && npx tsc --noEmit && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add ui/src/components/SessionChip.tsx ui/src/components/AppHeader.tsx ui/src/App.tsx ui/src/a11y.test.tsx ui/src/components/AppHeader.test.tsx
git commit -m "refactor(ui): the header owns the end-session confirmation

The chip rendered its own dialog. On a narrow viewport its controls move
into a popover that unmounts when it closes, and a dialog underneath them
would be destroyed by the click that opened it. No visual change."
```

---

## Task 9: The header menu

**Files:**
- Create: `ui/src/components/HeaderMenu.tsx`
- Create: `ui/src/components/HeaderMenu.test.tsx`
- Modify: `ui/src/components/Icon.tsx` (a `menu` glyph)
- Modify: `ui/src/strings.ts` (the `header` block, after `navProgress` at line 33)
- Modify: `ui/src/theme.css` (menu styles)

**Interfaces:**
- Consumes: `useFocusTrap` from `../lib/useFocusTrap`.
- Produces: `HeaderMenu({ label, children }: { label: string; children: ReactNode })`.
  Renders a button that toggles a popover containing `children`. Closes on
  Escape, on click outside, and on any click inside the panel — the last so a nav
  link or an action does not leave the menu hanging open behind the screen it
  just changed.

- [ ] **Step 1: Add the copy and the glyph**

In `ui/src/strings.ts`, in the `header` block after `navProgress` (line 33):

```ts
    // The narrow-viewport menu. The button is icon-only, so this is the
    // whole of its accessible name.
    menuLabel: "Menu",
    menuAccount: "Account",
```

In `ui/src/components/Icon.tsx`, add `| "menu"` to the `IconName` union after
`"help"`, and add to `PATHS`:

```tsx
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
```

- [ ] **Step 2: Write the failing test**

Create `ui/src/components/HeaderMenu.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HeaderMenu } from "./HeaderMenu";

describe("HeaderMenu", () => {
  test("starts closed and says so", () => {
    render(
      <HeaderMenu label="Menu">
        <button type="button">Exams</button>
      </HeaderMenu>,
    );
    const trigger = screen.getByRole("button", { name: "Menu" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Exams" })).toBeNull();
  });

  test("opens, and the trigger points at what it opened", async () => {
    const user = userEvent.setup();
    render(
      <HeaderMenu label="Menu">
        <button type="button">Exams</button>
      </HeaderMenu>,
    );
    const trigger = screen.getByRole("button", { name: "Menu" });
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("group");
    expect(trigger).toHaveAttribute("aria-controls", panel.id);
    expect(screen.getByRole("button", { name: "Exams" })).toBeInTheDocument();
  });

  test("Escape closes it and hands focus back", async () => {
    const user = userEvent.setup();
    render(
      <HeaderMenu label="Menu">
        <button type="button">Exams</button>
      </HeaderMenu>,
    );
    const trigger = screen.getByRole("button", { name: "Menu" });
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("button", { name: "Exams" })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  // A menu left open behind the screen its own link just changed is the
  // classic mobile-nav bug.
  test("choosing something closes it", async () => {
    const user = userEvent.setup();
    render(
      <HeaderMenu label="Menu">
        <button type="button">Exams</button>
      </HeaderMenu>,
    );
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(screen.getByRole("button", { name: "Exams" }));
    expect(screen.queryByRole("button", { name: "Exams" })).toBeNull();
  });
});
```

- [ ] **Step 3: Run and watch it fail**

Run: `cd ui && npm test -- src/components/HeaderMenu.test.tsx`
Expected: FAIL — cannot resolve `./HeaderMenu`.

- [ ] **Step 4: Write the component**

Create `ui/src/components/HeaderMenu.tsx`:

```tsx
import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { useFocusTrap } from "../lib/useFocusTrap";

/**
 * The narrow-viewport home for everything in the header that is not
 * time-critical: the nav links and the session controls.
 *
 * A popover rather than a full-screen sheet because of what is behind it.
 * The bar keeps the lease countdown, and a takeover would hide the one
 * number a hosted candidate cannot be left to guess while they are
 * reading a menu.
 *
 * `role="group"` on the panel, not `role="menu"`. The ARIA menu pattern
 * comes with a keyboard contract — arrow keys move between items, Tab
 * leaves — that this does not implement and does not want: the contents
 * are ordinary links and buttons, and Tab through them is the behaviour
 * everyone already has.
 */
export function HeaderMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  // Stable across renders: useFocusTrap holds it in a dependency array,
  // and a fresh closure each render would re-run the effect — tearing
  // down and re-adding the key handler, and re-stealing focus, on every
  // parent render while the menu is open.
  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="header-menu">
      <button
        type="button"
        className="header-menu-button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="menu" />
      </button>
      {open && (
        <>
          {/* Catches the click that dismisses. Not focusable and not in
              the a11y tree: Escape is the keyboard way out, and this is
              only for a pointer. */}
          <div className="header-menu-scrim" aria-hidden="true" onClick={close} />
          <div
            ref={panelRef}
            id={panelId}
            role="group"
            aria-label={label}
            className="header-menu-panel"
            // Any activation inside closes. The contents are links and
            // one-shot actions, so there is nothing here a candidate
            // presses twice — and a menu still open over the screen its
            // own link just changed is the failure this avoids.
            onClick={close}
          >
            <FocusTrap containerRef={panelRef} onClose={close} />
            {children}
          </div>
        </>
      )}
    </div>
  );
}

// useFocusTrap must run against a mounted container, and the panel only
// exists while open. A child component keeps the hook unconditional — a
// hook called inside `{open && …}` in the parent would be a conditional
// hook — while still mounting and unmounting with the panel.
function FocusTrap({
  containerRef,
  onClose,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  useFocusTrap(containerRef, onClose);
  return null;
}
```

- [ ] **Step 5: Style it**

Append to `ui/src/theme.css`, immediately before the final
`@media (max-width: 40rem)` block (which Task 11 removes):

```css
/* ---- header menu ----
   Everything in the header that is not time-critical, on a viewport too
   narrow to hold it. See HeaderMenu.tsx for why this is a popover and not
   a sheet. */

.header-menu {
  position: relative;
  display: flex;
  align-items: center;
}

.header-menu-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  background: none;
  border: 0;
  border-radius: var(--radius-s);
  color: var(--text-secondary);
  cursor: pointer;
}

.header-menu-button:hover {
  background: var(--surface-hover);
  color: var(--text);
}

/* Sits under the panel and over everything else, so a pointer anywhere
   outside dismisses. */
.header-menu-scrim {
  position: fixed;
  inset: 0;
  z-index: var(--z-panel);
}

.header-menu-panel {
  position: absolute;
  top: calc(100% + var(--space-2));
  right: 0;
  z-index: var(--z-dialog);
  min-width: 13rem;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  box-shadow: var(--shadow-2);
}

/* Every child is a full-width row with a real target, whatever element
   it happens to be — the panel takes nav links, session buttons and a
   plain label. */
.header-menu-panel > button,
.header-menu-panel > .header-menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: 0 var(--space-3);
  background: none;
  border: 0;
  border-radius: var(--radius-s);
  color: var(--text);
  font: inherit;
  font-size: var(--text-s);
  text-align: left;
  cursor: pointer;
}

.header-menu-panel > button:hover {
  background: var(--surface-hover);
}

.header-menu-label {
  padding: var(--space-2) var(--space-3) var(--space-1);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  font-weight: 600;
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.header-menu-rule {
  height: 1px;
  margin: var(--space-1) 0;
  background: var(--border);
}
```

- [ ] **Step 6: Run everything**

Run: `cd ui && npx tsc --noEmit && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add ui/src/components/HeaderMenu.tsx ui/src/components/HeaderMenu.test.tsx ui/src/components/Icon.tsx ui/src/strings.ts ui/src/theme.css
git commit -m "feat(ui): a header menu for the controls a phone cannot hold

A popover, not a sheet: the bar keeps the lease countdown behind it, and
that is the one number a hosted candidate cannot be left to guess."
```

---

## Task 10: The header collapses

**Files:**
- Modify: `ui/src/lib/useMediaQuery.ts` (a new exported query)
- Modify: `ui/src/components/AppHeader.tsx`
- Test: `ui/src/components/AppHeader.test.tsx`

**Interfaces:**
- Consumes: `HeaderMenu` from Task 9; `AppHeaderProps.session` from Task 8.
- Produces: `export const HEADER_COMPACT_QUERY = "(max-width: 48rem)"`.

**What collapses:** the nav links, the login, End session, Sign out.
**What stays in the bar:** brand mark, the countdown, About, the theme toggle,
the menu button, and `children`. About and theme stay because both own overlay or
mode state of their own — `InfoButton` renders `InfoDrawer` — and a popover that
unmounts on close would take the drawer with it, which is the same trap Task 8
exists to close for the confirmation dialog.

- [ ] **Step 1: Write the failing test**

Append to `ui/src/components/AppHeader.test.tsx`. Add these imports at the top of
the file: `import { HEADER_COMPACT_QUERY } from "../lib/useMediaQuery";` and
`import { matchMediaMock } from "../test/setup";`.

```tsx
  describe("compact", () => {
    const liveSession = {
      kind: "practical" as const,
      bank: "ckad-mock-01",
      pod: "sim-session-practical-583231",
      state: "ready" as const,
      startedAt: "2026-08-05T09:00:00Z",
      expiresAt: "2026-08-05T19:00:00Z",
      lastSeen: "2026-08-05T09:00:00Z",
    };

    beforeEach(() => matchMediaMock([HEADER_COMPACT_QUERY]));
    afterEach(() => matchMediaMock([]));

    test("puts the nav and the session controls behind one button", async () => {
      const user = userEvent.setup();
      renderHeader(
        <AppHeader
          nav={[{ label: "Exams", to: "/exams" }, { label: "Progress", to: "/progress" }]}
          session={{ login: "octocat", session: liveSession, onChanged: () => {} }}
        />,
      );

      expect(screen.queryByRole("button", { name: "Exams" })).toBeNull();
      expect(screen.queryByRole("button", { name: strings.hosted.signOut })).toBeNull();

      await user.click(screen.getByRole("button", { name: strings.header.menuLabel }));
      expect(screen.getByRole("button", { name: "Exams" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Progress" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: strings.hosted.endSession })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: strings.hosted.signOut })).toBeInTheDocument();
      expect(screen.getByText("octocat")).toBeInTheDocument();
    });

    // Every control has exactly one accessible name at any width. Rendering
    // both copies and hiding one in CSS would give a screen reader two of
    // each, which is worse than the overflow it would be fixing.
    test("does not render a second copy of anything", async () => {
      const user = userEvent.setup();
      renderHeader(
        <AppHeader
          nav={[{ label: "Exams", to: "/exams" }]}
          session={{ login: "octocat", session: liveSession, onChanged: () => {} }}
        />,
      );
      await user.click(screen.getByRole("button", { name: strings.header.menuLabel }));
      expect(screen.getAllByRole("button", { name: "Exams" })).toHaveLength(1);
      expect(screen.getAllByRole("button", { name: strings.hosted.signOut })).toHaveLength(1);
    });

    // The lease is taken back at its cap whatever the candidate is doing.
    // It must never be a tap away.
    test("keeps the countdown, About and the theme control in the bar", () => {
      renderHeader(
        <AppHeader session={{ login: "octocat", session: liveSession, onChanged: () => {} }} />,
      );
      const bar = screen.getByRole("banner");
      expect(bar).toHaveTextContent(/left|Ends in|Session over/);
      expect(screen.getByRole("button", { name: strings.info.open })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /theme/i })).toBeInTheDocument();
    });

    // The dialog is raised from inside the popover and must outlive it.
    test("the end-session confirmation survives the menu closing", async () => {
      const user = userEvent.setup();
      renderHeader(
        <AppHeader session={{ login: "octocat", session: liveSession, onChanged: () => {} }} />,
      );
      await user.click(screen.getByRole("button", { name: strings.header.menuLabel }));
      await user.click(screen.getByRole("button", { name: strings.hosted.endSession }));

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent(strings.hosted.endConfirmTitle);
      // The menu itself is gone.
      expect(screen.queryByRole("group", { name: strings.header.menuLabel })).toBeNull();
    });
  });
```

Add `beforeEach, afterEach` to the vitest import in that file if absent.

- [ ] **Step 2: Run and watch it fail**

Run: `cd ui && npm test -- src/components/AppHeader.test.tsx -t "compact"`
Expected: FAIL — `HEADER_COMPACT_QUERY` is not exported.

- [ ] **Step 3: Add the query**

Append to `ui/src/lib/useMediaQuery.ts`:

```ts
/**
 * Too narrow for the header's full row.
 *
 * At its fullest that row is a wordmark, a rule, a crumb, a detail line,
 * two nav links, a login, a lease countdown and four buttons. It starts
 * colliding well above the 560px the old rule used, which only ever hid
 * the crumb and let the rest overflow.
 */
export const HEADER_COMPACT_QUERY = "(max-width: 48rem)";
```

- [ ] **Step 4: Branch the header**

In `ui/src/components/AppHeader.tsx`, add the imports:

```tsx
import { HeaderMenu } from "./HeaderMenu";
import { HEADER_COMPACT_QUERY, useMediaQuery } from "../lib/useMediaQuery";
```

Add to the function body, beside `confirming`:

```tsx
  // Branched in JS rather than hidden in CSS, and that is the whole
  // point: the controls MOVE. Rendering both copies and hiding one would
  // give every button two accessible names, which is a worse bug than the
  // overflow it fixes.
  const compact = useMediaQuery(HEADER_COMPACT_QUERY);
```

Extract the nav links into a helper so both layouts render the same markup.
Above the component:

```tsx
function NavLinks({ nav }: { nav: NavItem[] }) {
  return (
    <>
      {nav.map((item) =>
        item.current ? (
          <span key={item.to} className="app-header-link app-header-link-on" aria-current="page">
            {item.label}
          </span>
        ) : (
          <button
            key={item.to}
            type="button"
            className="app-header-link"
            onClick={() => navigate(item.to)}
          >
            {item.label}
          </button>
        ),
      )}
    </>
  );
}
```

Replace the whole `.app-header-tail` block with:

```tsx
      <div className="app-header-tail">
        {!compact && session && (
          <>
            <SessionChip login={session.login} session={session.session} />
            <SessionActions session={session.session} onEnd={() => setConfirming(true)} />
          </>
        )}
        {!compact && nav && nav.length > 0 && (
          <nav className="app-header-nav" aria-label={strings.header.navLabel}>
            <NavLinks nav={nav} />
          </nav>
        )}
        {/* The countdown never collapses: a hosted seat is taken back at
            its cap whatever the candidate is doing, so the number they
            cannot guess must not be behind a tap. */}
        {compact && session?.session && (
          <SessionChip login="" session={session.session} />
        )}
        {children}
        <InfoButton />
        <ThemeToggle />
        {compact && (nav?.length || session) && (
          <HeaderMenu label={strings.header.menuLabel}>
            {nav && nav.length > 0 && <NavLinks nav={nav} />}
            {session && (
              <>
                <div className="header-menu-rule" />
                <span className="header-menu-label">{strings.header.menuAccount}</span>
                <span className="header-menu-item">{session.login}</span>
                <SessionActions
                  session={session.session}
                  onEnd={() => setConfirming(true)}
                />
              </>
            )}
          </HeaderMenu>
        )}
      </div>
```

`SessionChip` renders `login` in a span; passing `""` in compact mode leaves an
empty span, which the CSS in Task 11 hides. Add to `SessionChip`'s body, in place
of the unconditional user span:

```tsx
      {login && <span className="session-chip-user">{login}</span>}
```

- [ ] **Step 5: Run everything**

Run: `cd ui && npx tsc --noEmit && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/AppHeader.tsx ui/src/lib/useMediaQuery.ts ui/src/components/SessionChip.tsx ui/src/components/AppHeader.test.tsx
git commit -m "feat(ui): the header collapses instead of overflowing

Below 48rem the nav links and the session controls move into the menu.
They move rather than being hidden in CSS: two copies would give every
control two accessible names."
```

---

## Task 11: One breakpoint, and a desktop bar that is grouped

**Files:**
- Modify: `ui/src/theme.css:273-287` (the 560px block) and `theme.css:6433-6437`
  (the stray 40rem block)
- Modify: `ui/src/theme.css:231-271` (link and nav rules)
- Test: `ui/src/styles/layout.test.ts` (unchanged, must still pass)

**Interfaces:**
- Consumes: the `48rem` value from Task 10's `HEADER_COMPACT_QUERY`. The two must
  agree; a comment in each points at the other.
- Produces: no exports.

- [ ] **Step 1: Give the links a real target and a visible current state**

In `ui/src/theme.css`, replace the block at lines 231-271 with:

```css
.app-header-back,
.app-header-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  /* 44px, which is the floor for a pointer target. This was
     `var(--space-1) 0` — about 24px tall and no wider than its word. */
  min-height: 44px;
  padding: 0 var(--space-3);
  background: none;
  border: 0;
  border-radius: var(--radius-s);
  font: inherit;
  font-size: var(--text-s);
  font-weight: 500;
  cursor: pointer;
}

.app-header-back {
  color: var(--accent);
  white-space: nowrap;
}

.app-header-back:hover {
  color: var(--accent-strong);
  background: var(--surface-hover);
}

/* Tight, because the links are now padded: the gap used to be doing the
   separating that the targets do. */
.app-header-nav {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.app-header-link {
  color: var(--text-secondary);
}

.app-header-link:hover {
  color: var(--text);
  background: var(--surface-hover);
}

/* A rule under the word, not a hue change alone. aria-current is the
   only thing that said "you are here", and a state carried by colour
   alone is not a state to everyone. */
.app-header-link-on {
  color: var(--text);
  box-shadow: inset 0 -2px 0 var(--accent);
  cursor: default;
}
```

- [ ] **Step 2: Group the desktop bar**

Replace `.app-header-tail`'s rule (lines 168-171) with:

```css
/* Wider than the lead's gap on purpose: this cluster is three groups —
   the session, the nav, the icon buttons — and at the lead's spacing they
   read as one undifferentiated row of eight controls. */
.app-header-tail {
  gap: var(--space-4);
  flex-shrink: 0;
}
```

- [ ] **Step 3: Replace both breakpoints with one**

Replace the block at lines 273-287 with:

```css
/* One breakpoint for the whole header, and it must stay in step with
   HEADER_COMPACT_QUERY in lib/useMediaQuery.ts — that is what decides
   which controls are in the DOM, and this only dresses what is left.
   Under it the crumb goes first: the mark still says where you are, and
   the nav has moved into the menu rather than being dropped.

   This replaced two unrelated rules — a 560px block here and a 40rem
   block for .session-chip-user at the bottom of the file — that between
   them hid four things and let the other eight overflow. */
@media (max-width: 48rem) {
  .app-header {
    /* Logical, so the notch inset lands on the physical side it belongs
       to under an RTL locale as well. */
    padding-inline: max(var(--space-3), env(safe-area-inset-inline-start))
      max(var(--space-3), env(safe-area-inset-inline-end));
    gap: var(--space-2);
  }

  .app-header-crumb,
  .app-header-rule,
  .app-header-detail,
  .app-header-wordmark-tail {
    display: none;
  }

  .app-header-tail {
    gap: var(--space-1);
  }
}
```

- [ ] **Step 4: Delete the stray rule**

Delete the final block of `ui/src/theme.css` (lines 6433-6437):

```css
@media (max-width: 40rem) {
  .session-chip-user {
    display: none;
  }
}
```

It is now dead: `AppHeader` passes no login to the compact chip at all.

- [ ] **Step 5: Verify**

Run: `cd ui && npx tsc --noEmit && npm run lint && npm test`
Expected: PASS, including `src/styles/layout.test.ts` and
`src/styles/contrast.test.ts`.

Then confirm by eye that the header's height rule is untouched:

Run: `cd ui && grep -A 3 "^\.app-header {" src/theme.css`
Expected: the output still contains `height: 56px` and, below it,
`flex-shrink: 0`.

- [ ] **Step 6: Commit**

```bash
git add ui/src/theme.css
git commit -m "style(ui): one breakpoint for the header, and a bar with groups

Two unrelated media queries hid four of twelve controls and let the rest
overflow. The nav links were a 24px target with no current state a
colour-blind reader could see."
```

---

## Task 12: The a11y sweep, and the whole suite green

**Files:**
- Modify: `ui/src/a11y.test.tsx`
- Test: everything

**Interfaces:**
- Consumes: every export from Tasks 8-11.
- Produces: nothing.

- [ ] **Step 1: Add the open menu and the rebuild screen to the sweep**

In `ui/src/a11y.test.tsx`, add `import { HeaderMenu } from "./components/HeaderMenu";`
and append two cases in the style of the file's existing ones:

```tsx
test("the header menu, open", async () => {
  const user = userEvent.setup();
  const { container } = render(
    <HeaderMenu label="Menu">
      <button type="button">Exams</button>
      <button type="button">Progress</button>
    </HeaderMenu>,
  );
  await user.click(screen.getByRole("button", { name: "Menu" }));
  expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
});

test("the boot screen, rebuilding", async () => {
  const { container } = render(
    <HostedBooting
      session={{
        kind: "practical",
        bank: "ckad-mock-01",
        pod: "sim-session-practical-583231",
        state: "starting",
        op: "reset",
        startedAt: "2026-08-05T09:00:00Z",
        expiresAt: "2026-08-05T19:00:00Z",
        lastSeen: "2026-08-05T09:00:00Z",
      }}
      onChanged={() => {}}
    />,
  );
  expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
});
```

- [ ] **Step 2: Run the full UI gate**

Run: `cd ui && npx tsc --noEmit && npm run lint && npm test`
Expected: PASS, with no violations reported.

- [ ] **Step 3: Run the full Go gate**

Run: `cd hub && go test ./... && go vet ./...`
Expected: PASS.

- [ ] **Step 4: Run the other three Go modules, which this plan did not touch**

Run: `for m in conductor facilitator proxy; do (cd $m && go test ./... && go vet ./...) || echo "FAILED: $m"; done`
Expected: no `FAILED:` line.

- [ ] **Step 5: Commit**

```bash
git add ui/src/a11y.test.tsx
git commit -m "test(ui): the open menu and the rebuild screen join the a11y sweep"
```

---

## Verification

Before opening a pull request, confirm each of these by running the command and
reading its output — not by assuming a green suite covers it.

- [ ] `cd hub && go test ./... && go vet ./...` — passes.
- [ ] `for m in conductor facilitator proxy; do (cd $m && go test ./... && go vet ./...); done` — passes.
- [ ] `cd ui && npx tsc --noEmit && npm run lint && npm test` — passes.
- [ ] `cd ui && grep -c "throw new Error(await readError(res))" src/api.ts` — prints `0`.
- [ ] `grep -n "max-width: 560px\|max-width: 40rem" ui/src/theme.css` — prints nothing.
- [ ] `grep -n "48rem" ui/src/theme.css ui/src/lib/useMediaQuery.ts` — prints one hit in each.
- [ ] `cd ui && npm run build` — succeeds.

**Manual browser pass**, which the automated gate structurally cannot cover
(jsdom has no layout engine, so no test in this repo can see an overflow):

- [ ] At 375px wide, the header fits on one line with no horizontal scroll, and
      the lease countdown is readable without opening the menu.
- [ ] The menu opens, Tab cycles inside it, Escape closes it and returns focus to
      the button.
- [ ] End session from inside the menu raises the confirmation, and the
      confirmation is still there after the menu has closed.
- [ ] At 1440px the header is unchanged from `main` apart from the grouping,
      the larger link targets and the underline on the current section.
- [ ] Both light and dark themes.
