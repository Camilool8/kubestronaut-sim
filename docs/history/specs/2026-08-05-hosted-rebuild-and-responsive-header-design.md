# A rebuild the app owns, and a header that fits a phone

Date: 2026-08-05

Two unrelated defects, shipped together because both live in the same
four files of the SPA's chrome.

## Part one — "New attempt" reports itself as a failure

### The symptom

A candidate finishes an attempt on a hosted seat, presses **New
attempt** on the score screen, and gets a warning toast:

> Cannot reach facilitator: Error: your exam environment is still starting

They are then dropped on the exam picker with no explanation, having
asked for another go at the exam they were already sitting.

Nothing is broken. Every part of that sentence is true and none of it is
news, because the app itself asked for the thing it is complaining
about.

### What actually happens

On a hosted seat, `New attempt` is `POST /api/control/reset`, and the
hub answers it with `Recycle` (`hub/internal/session/session.go:567`):
the candidate's session Pod is **deleted and recreated**. Reset and
switch are Pod replacement in a hosted deployment, not the in-place
rebuild they are under `./sim up` — `hub/internal/api/api.go:143` says
so, and it is the right design. It is simply invisible to the browser.

While the Pod is gone, `runRecycle` clears the session's address
(`session.go:632`), so the proxy has nowhere to send traffic and answers
every `/api/*` request with a 503 (`hub/internal/api/proxy.go:104`):

```json
{"error": "your exam environment is still starting", "state": "pending"}
```

Four separate things then go wrong, and each one is a different bug:

1. **The toast.** `SimApp`'s 10s session poller hits that 503,
   `getSession` throws a plain `Error` carrying the prose, and
   `handlePollError` (`ui/src/App.tsx:278`) pushes a warning toast. The
   toast is correct code doing its job — it exists because the app's
   most central fetch used to fail in silence — but it cannot tell an
   expected wait from an outage, because nothing in the response says
   which this is.

2. **The overlay dies.** `applyControlResult` optimistically renders
   `ControlProgress`, which is exactly the right screen for a rebuild.
   Within ~2s `/api/me` reports `session.state: "pending"`, and
   `App()` (`ui/src/App.tsx:119`) gates on `me.session?.state ===
   "ready"` — so `SimApp` unmounts wholesale and takes the overlay with
   it. The toast, pushed into a module-level store, outlives it.

3. **The wrong story.** `HostedHome` renders `HostedBooting`, which is
   written for a first boot: "we are building the cluster your chosen
   exam asked for", with a *give up* button. The candidate has a seat
   and did not ask to give it up.

4. **The landing.** The recycled Pod is stamped with `BANK` at creation
   (`images/k8s-env/start.sh:131`), so it boots straight into building
   the seat's exam and comes up with a live cluster. But `SimApp`
   remounts on a bare fragment, so `modeBankId` is null, `session.state`
   is `idle`, and the switch falls through to the exam picker — one
   card, the exam they were already sitting.

### The fix

**1. The hub says what kind of wait this is, in a field.**

`proxy.go`'s 503 body gains `"code": "environment_starting"`; the
`ErrorHandler`'s 502 gains `"code": "environment_unreachable"`. No
behaviour change. It exists so a client can tell an expected wait from
an outage without reading prose — prose that is a UI string in a Go file
and will be reworded one day by someone who has no idea a client is
parsing it.

**2. `/api/me` reports the in-flight op.**

The hub already knows: `Recycle` labels its job `reset` or `switch` in
the session's own job store before returning. Surfacing that on the
session object in `/api/me` costs one field and buys the boot screen the
ability to tell a first boot from a rebuild.

Deliberately *not* a second poller against `/api/control/status`:
`useHosted` already polls `/api/me` every 2s while a session is not
ready, and this is a fact about the session. It is also server truth, so
it survives a reload mid-rebuild — which a remembered click would not.

**3. The toast learns the difference.**

`ui/src/api.ts` grows an `ApiError extends Error` carrying `status` and
`code`. Twenty call sites throw through one `readError` helper today, so
this is a single edit at the source, and `String(err)` on the result is
unchanged — every existing call site and every string it feeds keeps
working.

`handlePollError` then skips the toast when either:

- the error is an `ApiError` with `code === "environment_starting"`, or
- a control job is in flight (`control.busy`).

Both, not either alone. The first is the durable signal and covers a
reload landing mid-rebuild. The second covers the window between the
202 and `/api/me` flipping — and it covers the **local** product, where
a reset restarts the facilitator in place and the poll fails for the
same non-reason. `App.tsx:372` already carries a comment noting exactly
that about the control poller; the session poller never got the same
treatment.

`pollError` state is still set either way, so the pre-first-session
loading screen keeps its message.

**4. `HostedBooting` gains a rebuild mode.**

With `op` present it renders rebuild copy — "Rebuilding your
environment", naming the certification — instead of first-boot copy. It
keeps the elapsed counter and `PendingBar`, which are the parts that
work: they tick identically whether or not the candidate accepts motion.
"Give up" is reworded to say what it does, which is end the session and
release the seat. It stays: a candidate whose rebuild has wedged needs a
way out, and it is the only one on the screen.

**5. The rebuild's clock starts when the rebuild does.**

`runRecycle` restamps `StartedAt` in its `start` phase, which is after the
old Pod has been deleted and drained. The boot screen's elapsed counter is
`now - StartedAt`, so for the whole of the first phase a rebuild would count
from the session's original start — "4:21:07 so far", thirty seconds in. The
restamp moves to `Recycle`, where the job is accepted. `ExpiresAt` stays
where it is: it is the lease, and moving it is a different decision from
fixing a displayed counter.

**6. The landing is chosen, not fallen into.**

When a hosted session goes ready and carries a bank, `App()` navigates
to `#/exams/<bank>/mode` rather than letting `SimApp` mount on a bare
route.

This applies to **first boots as well as rebuilds**. A hosted seat is
bank-scoped — the Pod is stamped and sized for one exam, and the picker
inside the session offers no other — so a picker with one card on it is
a step that asks the candidate to re-confirm a decision they made in the
lobby. Going straight to the mode screen is right in both cases.

The safety net already exists: `Mode.tsx:372` bounces to `/exams` when
the facilitator's active exam is not the bank in the route. So the worst
case of a wrong guess here is exactly today's behaviour.

### What this does not fix

A hosted "new attempt" still costs a full Pod recycle plus a cluster
build, because reset *is* Pod replacement in a hosted deployment. This
spec makes those minutes legible; it does not make them shorter. Making
the reset in-place would mean giving the session Pod's conductor a way
to tear down and rebuild its own cluster, which is a different piece of
work with its own security argument to make.

## Part two — the header does not fit a phone

### The symptom

`AppHeader` + `SessionChip` is a single non-wrapping flex row carrying,
at its fullest: brand mark and wordmark, a rule, a crumb, a detail line,
the backgrounded-job chip, two nav links, the login name, the lease
countdown, End session, Sign out, About, and the theme toggle.

Its only responsive rule (`ui/src/theme.css:276`) hides the crumb, the
rule and the detail under 560px. A second, unrelated rule at the very
bottom of the file (`theme.css:6433`) hides the login name under 40rem.
Everything else stays in the row and overflows.

### The fix

**Collapse into a menu below one breakpoint.**

Driven by `useMediaQuery` (already in `lib/`), not by CSS `display:
none`. The distinction matters: the controls have to *move* into the
popover, and rendering both copies would give every button two
accessible names — which breaks the a11y sweep and, more to the point,
makes the header unusable with a screen reader.

What collapses: the nav links, the login name, End session, Sign out.

What stays in the bar: the brand mark, the lease countdown, About, the
theme toggle, the menu button, and `BackgroundJobChip` when a rebuild is
running in the background. The countdown stays because a hosted session
is taken back at its cap whatever the candidate is doing — that is the
one number they cannot be left to guess, and it must never be a tap
away. The job chip stays for the reason it was built: a 2-4 minute
teardown behind an idle-looking page.

About and the theme toggle stay for a reason found while planning rather
than while writing this. `InfoButton` renders `InfoDrawer` itself, so
inside a popover that unmounts on close the drawer would be destroyed by
the click that opened it — precisely the hazard called out below for the
End-session dialog. Moving them in would mean hoisting the drawer's state
into the header as well, for two icon buttons that cost about 88px in a
bar that has room for them. They stay, and the menu holds what the
`AppHeader` can own without restructuring a component that has nothing to
do with this change.

**The menu** is a popover under its trigger with `aria-expanded` and
`aria-controls`, Escape to close, focus returned to the trigger,
click-outside to dismiss, and `useFocusTrap` while open — the pattern
`InfoDrawer` already establishes. Two sections: navigation, then
account. About and the theme toggle are not among them — they stay in
the bar, for the reason above.

One hazard to design around: `SessionChip` renders its own End-session
confirmation `Dialog`. Inside a popover that unmounts on close, that
dialog would be destroyed by the very click that opens it. The confirm
state is lifted and the dialog rendered outside the popover.

**The desktop pass**, since it is the same component either way. Today
the bar is eight ungrouped controls in a flat row, and the nav links
have `padding: var(--space-1) 0` — roughly a 24px target, well under the
44px minimum. So: group them (nav | rule | session | icons), give the
links a real target and a hover and active treatment, and make
`aria-current` visible as something other than a colour shift, since a
state that differs only by hue is not a state to everyone.

**Constraints to hold.** The 56px fixed height and `flex-shrink: 0` stay
exactly as they are: `styles/layout.test.ts` asserts both, and the
comment at `theme.css:145` records what happens without the second one —
a header whose height depends on how long the page below it is. The
popover is absolutely positioned and changes neither.

The two ad-hoc breakpoints are replaced by one system at 48rem, and the
horizontal padding picks up `env(safe-area-inset-*)` for notched phones.

### Tests

- `AppHeader.test.tsx`: collapsed mode — the menu opens, closes on
  Escape, returns focus, and every collapsed control is reachable
  through it. `matchMediaMock` already exists in `test/setup`.
- `a11y.test.tsx`: the open menu joins the sweep.
- `SessionChip`: the End-session confirmation still works from inside
  the menu.
- `styles/layout.test.ts`: unchanged, and must stay passing.

## Scope

Not touched: the exam's own topbar (`Exam.tsx`), which is a different
component with a different job — a clock and a submit button — and is
deliberately not a variant of this header.
