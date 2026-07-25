# Milestone F — UI Polish: one markdown renderer, one async primitive, no silent failures

Status: design approved, not started
Branch: milestone-f (off main, which now carries D and E)

## Goal

Four reported defects share one cause: **failure and in-flight state
render as absence**. A control action that 502s shows nothing. A catalog
fetch that 502s leaves a lobby that looks single-exam. A solution's
markdown renders unstyled because the styled renderer was never wired to
it. Fix the four, and remove the structural conditions that let them
happen — a second markdown implementation, and per-call-site async
handling with no enforced error branch.

## The defects, as measured

### 1. "New attempt" does nothing

With the conductor unreachable, the facilitator's proxy returns **502
with an empty body**:

    POST /api/control/reset  → 502, body ""
    GET  /api/control/banks  → 502, body ""

`startControlReset()` (`ui/src/api.ts:272`) returns `{ok:false,
error:""}`. `applyControlResult` (`ui/src/App.tsx:119-123`) takes the
`ok:false` branch, refetches control status, and renders nothing — no
toast, no overlay, no message. `handleNewAttempt` (`App.tsx:130`) does
not catch, so a rejected fetch becomes an unhandled rejection instead.

Evidence, 2026-07-25. The happy path was driven in a real browser and is
healthy: 202 → five phases → session returns to `idle`. The 502 was then
reproduced by stopping the conductor and issuing the same POST. The
swallowing itself is established by code inspection of the `ok:false`
branch; the button was not re-clicked in the 502 state, because reaching
the Score screen requires an ended session and the reset had already
returned the session to `idle`. Its sibling, defect #4, *was* reproduced
through the UI in exactly that state and shares the code path.
**The server is not at fault.**

Note the empty body: surfacing `error` verbatim would show a blank
toast. `readError()` needs a fallback.

### 2. Skip-link banner clipped at the viewport top

`.skip-link` (`ui/src/theme.css:1124`) hides itself with
`transform: translateY(-200%)` — travel proportional to *its own
height*. Measured in Chrome at 1440×900:

| quantity                                  | value      |
|-------------------------------------------|------------|
| `.desktop-viewport` top (below topbar)    | 54.09px    |
| `.skip-link` `top`                        | 8px        |
| `translateY(-200%)` of a 41.25px element  | −82.5px    |
| resulting top                             | −20.41px   |
| **visible on screen**                     | **20.84px**|

−82.5px of travel cannot clear a 62px offset. Identical at 1100px wide,
so it is not width-dependent — it is always visible on this layout.

Invisible to every existing gate: axe has no layout engine
(`tokens.css:15`, `follow-ups.md:41`), vitest renders in jsdom, and
smoke asserts over HTTP. Only a real browser finds this class of bug.

### 3. Solution markdown unstyled and unresponsive

`Score.tsx:151` renders a bare `<ReactMarkdown>{solution.markdown}</…>`
— no wrapper class, no `components` override. Every style that makes
question markdown work lives on `.question-markdown` (`theme.css:444-502`,
including `pre { overflow-x: auto }`). So a long yaml line in a
`solution.md` pushes the page sideways, code is indistinguishable from
prose, and inline values are not click-to-copy the way they are in a
question. The cause is that markdown was implemented twice and only one
copy was finished.

The checks table is *not* affected — `CheckList.tsx:18` already wraps it
in `.check-list-scroll`.

### 4. Exam catalog silently vanishes

Same 502 as #1: `getBanks()` throws, `Start.tsx` catches, and the whole
"CHOOSE YOUR EXAM" section is absent with no error and no placeholder.
The app misrepresents itself as single-exam. Reproduced the same way.

## Architecture

### New: `lib/useAsync.ts`

`useAsync(fn, deps, opts?) → {status: 'idle'|'loading'|'success'|'error',
data, error, reload}`. Owns the cancel-on-unmount pattern currently
hand-rolled in `QuestionPanel.tsx:83-101`. Every fetch in the app goes
through it.

By default an in-flight call registers with the progress store. Pollers
must pass `{background: true}` to opt out: the Score screen polls results
every 3s (`Score.tsx:14`) and the control status poll runs every 2s while
busy (`App.tsx:26`) — registering those would leave the top bar flashing
permanently. The rule is that the bar reflects work the user is *waiting
on*, not every request in flight.

### New: `components/Async.tsx`

A render boundary whose `error` prop is **required**. Rendering nothing
on failure stops being possible to express — the compiler rejects it.
This, not the toasts, is the durable fix for #1 and #4; toasts are what
the user sees, the required prop is what keeps the bug from returning.

### New: `components/Markdown.tsx` — the single renderer

Replaces both existing markdown paths. Contract:

- inline `code` → `CopyableCode`, moved verbatim from `QuestionPanel.tsx`
  (desktop-clipboard bridge, existing toast vocabulary, unchanged)
- fenced `code` → `CodeBlock`: `<figure>` + language chip + copy-whole-
  block through the same `desktopClipboard` bridge, `<pre>` with
  `overflow-x: auto`
- highlighting: `highlight.js/lib/core` with **only** `yaml`, `bash`,
  `json` registered, loaded via dynamic `import()`. Renders plain until
  it resolves; identical font, size and spacing so the swap causes no
  layout shift. The lobby never pays for it.
- one `.md` CSS namespace replaces `.question-markdown`, consumed by
  `QuestionPanel` **and** `Score`

Bundle: `follow-ups.md:50` records ~470KB today. The language subset plus
lazy loading keeps this off the critical path; measure and record the
delta in the milestone's final commit.

### New: `progressStore` + `TopProgress`

Modelled on `toastStore` (`components/toastStore.tsx`, already tested).
In-flight `useAsync` calls increment a counter; the bar shows while > 0,
with a 200ms delay before appearing and a 300ms minimum visible so fast
local fetches don't flash. Indeterminate by design — a determinate bar
needs persisted phase medians, which stays a follow-up.

### New: `components/ScreenTransition.tsx`

Crossfade keyed on `session.state` in `App`. Opacity and transform only
(compositor-only), additive under `prefers-reduced-motion: no-preference`
to match the convention documented at `theme.css:1239-1251`.

### Modified

- `api.ts` — `readError()` returns a fallback string for empty bodies.
- `App.tsx` — `applyControlResult` toasts on `ok:false`;
  `handleNewAttempt`/`handleRetry` wrapped in try/catch so a rejected
  fetch also speaks.
- `Start.tsx` — catalog via `useAsync`; 502 renders an error card with
  Retry instead of an empty section.
- `Score.tsx` — solution renders through `<Markdown>`; results polling
  moves to `useAsync`-shaped state with a skeleton while grading.
- `theme.css` — skip-link hide rewritten; `.md` namespace; score
  responsive rules.

### The skip-link fix

Replace the height-relative hide with the clip idiom already present as
`.sr-only` (`base.css:70-80`), plus a `:focus` override restoring it as
`position: fixed`. Height- and container-independent: it cannot leak
again if the topbar grows or the string wraps.

## Error-handling contract

- Every control action surfaces a message; empty bodies get a fallback.
- Every `useAsync` consumer renders an error branch — enforced by type.
- Toasts for user-initiated actions; inline error cards with Retry for
  data a screen needs to be correct.

## Responsive

- `.md pre` carries `overflow-x: auto` at both call sites (fixes #3).
- `.question-result summary` may wrap; `@media (max-width: 600px)` rules
  for score banner padding and full-width actions.
- Verified at 1440 / 900 / 390 in a real browser, light and dark.

## Testing

- vitest: `useAsync` (success, error, cancel-on-unmount), `Markdown`
  (inline→button, fenced→CodeBlock, language chip, copy), `progressStore`.
- Two regression tests aimed squarely at the reported bugs: `App` toasts
  on a mocked 502 control action, and `Start` renders an error card on a
  mocked 502 catalog fetch.
- axe scans extended over code blocks and error states.
- Contrast ratios for any new tokens computed by hand and recorded in
  `tokens.css` — axe cannot check them.
- **Real-browser pass at three widths, light and dark.** This closes
  `follow-ups.md:48`, and is the only gate that would have caught #2.

## Out of scope

Determinate progress bar (needs persisted phase medians), practice /
untimed mode for WCAG 2.2.1, and the "Kubestronaut" trademark question —
all triaged in `docs/follow-ups.md`, none of them a UI polish concern.

## Note for future milestones

Defect #2 was a 21px CSS leak that every automated gate in this repo is
structurally blind to. A real-browser pass belongs on the checklist at
the end of every UI milestone, not just this one.
