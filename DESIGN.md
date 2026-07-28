---
name: kubestronaut-sim
description: A calm instrument panel for a timed Kubernetes certification exam — Kubernetes blue on cool slate, in matched light and dark themes.
colors:
  bg: "#f7f9fc"
  surface: "#ffffff"
  surface-raised: "#eaeff7"
  border: "#a0acbe"
  border-strong: "#708197"
  surface-hover: "#e1e7f1"
  raised-hover: "#dbe3f0"
  overlay: "rgba(11, 18, 32, 0.55)"
  text: "#1a212b"
  text-muted: "#57626f"
  text-disabled: "#858f9e"
  accent: "#326ce5"
  accent-strong: "#2557c7"
  accent-soft: "#e4ecfd"
  accent-contrast: "#ffffff"
  danger: "#bb3730"
  warn: "#8a6100"
  success: "#16752f"
  focus-ring: "#326ce5"
typography:
  display:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "3.25rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.01em"
    fontFeature: "tabular-nums"
  headline:
    fontFamily: "IBM Plex Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "IBM Plex Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "IBM Plex Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "IBM Plex Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.55
    letterSpacing: "0.06em"
  data:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.55
    letterSpacing: "0.03em"
    fontFeature: "tabular-nums"
rounded:
  xs: "3px"
  s: "6px"
  m: "10px"
  pill: "999px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.5rem"
  "6": "2rem"
components:
  button:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.s}"
    padding: "0.5em 1.1em"
  button-hover:
    backgroundColor: "{colors.raised-hover}"
    textColor: "{colors.accent-strong}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-contrast}"
    rounded: "{rounded.s}"
    padding: "0.5em 1.1em"
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
    textColor: "{colors.accent-contrast}"
  button-danger:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.danger}"
    rounded: "{rounded.s}"
    padding: "0.5em 1.1em"
  button-danger-hover:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.m}"
    padding: "{spacing.6}"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.m}"
    padding: "{spacing.5}"
  bank-card:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.s}"
    padding: "0.75rem 1rem"
  question-tile:
    textColor: "{colors.text}"
    rounded: "{rounded.s}"
    padding: "0.35em 0.5em"
  question-tile-hover:
    backgroundColor: "{colors.surface-hover}"
  question-tile-current:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.s}"
    padding: "0.35em 0.5em"
  bank-card-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.s}"
    padding: "0.75rem 1rem"
  badge:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    padding: "0.05em 0.6em"
  instance-chip:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-strong}"
    rounded: "{rounded.pill}"
    padding: "0.15em 0.75em"
  timer:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.accent-strong}"
    typography: "{typography.data}"
    rounded: "{rounded.s}"
    padding: "0.2em 0.6em"
  timer-low:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.danger}"
    typography: "{typography.data}"
    rounded: "{rounded.s}"
    padding: "0.2em 0.6em"
  toast:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.s}"
    padding: "0.75rem 0.75rem 0.75rem 1rem"
  code-block:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.s}"
---

# Design System: kubestronaut-sim

## Overview

The interface a person looks at while a clock they cannot pause counts
down toward a result that matters to them. It is an instrument panel: it
reports state accurately, never competes for attention, never performs.
Three cool-slate tones, hairline borders, an accent held back until the
user reaches for something, and type doing the work ornament would do
elsewhere. Intensity is permitted only where intensity is information —
the countdown under five minutes, a failed phase, a verdict.

## Colours

One referential Kubernetes blue on slate neutrals that never drift warm.
Both themes are authored; neither is derived from the other. The
frontmatter carries light, the `:root` default; dark comes from
`[data-theme="dark"]`, mirrored into `prefers-color-scheme` for "system".

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#f7f9fc` | `#0b1220` | the page, and the resting fill for panels inset within a card |
| `--surface` | `#ffffff` | `#121a2b` | raised surfaces — lobby card, dialogs, drawer, topbar, toasts, question panel |
| `--surface-raised` | `#eaeff7` | `#1a2437` | third tone — default button fill, fenced code bodies, selected question row, timer chip |
| `--overlay` | `rgba(11, 18, 32, 0.55)` | `rgba(2, 6, 16, 0.66)` | scrim behind dialogs, drawer, control overlay |
| `--border` | `#a0acbe` | `#465476` | structural edges, always 1px |
| `--border-strong` | `#708197` | `#6a79a1` | control edges, and any border that carries a state |
| `--surface-hover` | `#e1e7f1` | `#1f2a44` | hover fill for a control resting on `--surface` or `--bg` |
| `--raised-hover` | `#dbe3f0` | `#243048` | hover fill for a control resting on `--surface-raised` |
| `--text` | `#1a212b` | `#d9dee5` | body text |
| `--text-muted` | `#57626f` | `#97a0af` | labels, metadata, command output, hints |
| `--text-disabled` | `#858f9e` | `#727c8e` | the label of a genuinely inoperable control |
| `--accent` | `#326ce5` | `#7aa2f7` | focus, currency, live progress, the primary fill |
| `--accent-strong` | `#2557c7` | `#a4c0fb` | accent-coloured text on `--accent-soft` or `--surface-raised` |
| `--accent-soft` | `#e4ecfd` | `#16294a` | the accent as a fill; never carries plain-accent text |
| `--accent-contrast` | `#ffffff` | `#0b1220` | text on a filled accent surface — the primary button only |
| `--danger` | `#bb3730` | `#e5605a` | End Exam, a failed check or phase, the countdown under five minutes |
| `--warn` | `#8a6100` | `#e0a850` | warning toasts at the 30/15/5-minute marks. Never a fill |
| `--success` | `#16752f` | `#57d183` | a passed check and a passing verdict. Never before a result exists |
| `--syntax-string` | `#146c43` | `#57d183` | strings and literals in a fenced block |
| `--syntax-number` | `#8a5200` | `#e0a850` | numbers in a fenced block |
| `--focus-ring` | `#326ce5` | `#7aa2f7` | the 2px focus outline |

The rules that govern them:

| Named rule | Statement |
|---|---|
| Contrast Ledger | every text pairing carries its measured ratio beside the token, and a pairing under 4.5:1 gets a substitute token rather than a waiver. jsdom has no layout engine, so `axe` skips contrast and the ledger is the only check (`tokens.css:13-16`) |
| Rare Accent | blue arrives for four things only — focus, currency (the selected question, the active bank, the running phase), live progress, and the one filled primary button per screen. A screen that reads as blue before it is touched has used it as decoration |
| Hover is not an accent channel | hover is one step of tone and nothing more, so the tile under a cursor never draws the outline that means "the question I am on" (`tokens.css:58-66`). Two exceptions, both elements with no resting box to tone: the click-to-copy value and the 6px panel resizer |
| Two-Tier Hairline | `--border-strong` if the edge identifies a control's hit area or carries a state, which answers WCAG 1.4.11's 3:1 floor; `--border` for everything structural (`tokens.css:34-54`) |
| Three Mirrors | these values also live in the Go locked page (`facilitator/internal/desktop/proxy.go`), the favicon (`ui/public/favicon.svg`) and the terminal palette (`images/desktop/assets/terminalrc` plus its xfconf twin), so a colour change is never a one-file change. Grep the hex — not every token is in every mirror |

## Typography

IBM Plex Sans (`system-ui`, -apple-system, Segoe UI) and JetBrains Mono
(`ui-monospace`, SFMono-Regular, Menlo, Consolas), both bundled via
`@fontsource`. There is no third face.

| Token | Value | Setting | Use |
|---|---|---|---|
| `--text-hero` | 3.25rem | Mono 700, 1.1, tabular | the score percentage. One site |
| `--text-2xl` | 1.75rem | Sans 700, 1.25, -0.01em | `.start-card h1`, the exam title. One site |
| `--text-xl` | 1.375rem | Sans 700, 1.25, -0.01em | the verdict (tracked to 0.12em), the score headline, the boot-panel and desktop-required headings |
| `--text-l` | 1.125rem | Mono 700, 0.03em, tabular | the countdown, stat values, `.md h2` |
| `--text-m` | 0.9375rem | Sans 400, 1.55 | the base. 15px and not 16px: the question panel is 360px wide and shares the screen with a terminal |
| `--text-s` | 0.85rem | Sans or Mono | the secondary step and the busiest non-base size — 30 sites in `theme.css`, including mode blurbs, bank meta, clipboard fields, keyboard rows, shortcut tables, the theme toggle |
| `--text-xs` | 0.75rem | Sans 600, 0.06em, uppercase | labels — section headings, stat labels, column heads, the bank badge, jump-grid domain heads, the code-block language tag (0.08em) |

The top three steps have one or two sites each. A type scale is a set of
permissions, not a set of quotas.

**The Mono-For-Truth Rule.** JetBrains Mono marks anything the candidate
must type, match, or trust as a measurement — names, ids, points,
durations, paths, output, the score. The test is mechanical: if a value
could be pasted into a terminal or compared digit by digit, it is mono.

**The Tabular Rule.** Anything that ticks takes `font-variant-numeric:
tabular-nums`. A digit that changes width makes a stable reading look
unstable, and the countdown is on screen for two hours.

**The Three-Colour Syntax Rule.** A fenced block colours keys and
keywords in `--accent-strong`, strings in `--syntax-string` and numbers
in `--syntax-number`; comments take `--text-muted` and italics, and
everything else inherits (`tokens.css:119-130`). The two value hues are
the exam terminal's own green and amber, which makes that palette a
fourth mirror.

## Layout

Two panes and a stack: a resizable question panel beside a fluid desktop
viewport under a wrapping topbar, and a single centred column everywhere
else. There are five full-page surfaces — `screens/Start.tsx`,
`screens/Exam.tsx`, `screens/Score.tsx`, `screens/BootProgress.tsx` and
`components/DesktopRequired.tsx`.

| Surface | Width |
|---|---|
| Lobby card | `min(680px, 100%)` |
| Score page | `max-width: 820px` |
| About drawer | `min(480px, 92vw)` |
| Confirm dialog | `min(440px, 90%)` |
| Control dialog | `min(92vw, 520px)` |
| Clipboard panel, keyboard popover | `min(92vw, 380px)` |

**Spacing** is six steps, `--space-1` to `--space-6`: 0.25 / 0.5 / 0.75 /
1 / 1.5 / 2rem. Cards take `--space-6` and drop to `--space-4` below
600px, dialogs take `--space-5`, dense rows `--space-1`–`--space-2`.
Density is deliberately higher inside the exam than on the lobby and
score screens: one is a working surface, the others are reading surfaces.

**The panel edge is draggable.** `.question-panel` is `clamp(280px,
var(--panel-width, 360px), min(600px, 50vw))`, and `PanelResizer` — a
`role="separator"` operable by pointer and by keyboard — writes that
custom property. Not an inline `width`: an inline style beats a class
rule, so a persisted width would win over the clamp.

| Number | Meaning |
|---|---|
| 280px | where the nav row stops fitting and the jump grid drops to three columns |
| 360px | the default |
| 600px | a measure decision: 568px of text at the 15px base is about 75ch, and 700px would be ~90ch |
| 50vw | narrows the panel as the window narrows, without touching the stored preference. No listener, no JS |

There is deliberately no automatic widening: growing a reading measure
under someone mid-question moves text while they read it. The resizer
holds noVNC's `resizeSession` false for a gesture, and is suppressed
below 900px where the panel leaves the flow.

Three breakpoints, each changing structure rather than scale:

| Query | Change |
|---|---|
| `max-width: 900px` | the question panel leaves the flow and becomes an overlay drawer at `min(85vw, 360px)` with `--shadow-3`, over a 36px collapsed rail |
| `max-width: 600px` | dialogs and the boot panel go full-bleed (width 100%, `max-height: 100dvh`, radius 0), the clipboard panel and keyboard popover become bottom sheets, lobby actions stack, and the domain table's cells become blocks |
| `any-pointer: coarse` | icon controls and the panel's `--control-size` go from 28px to a 44px minimum. Keyed to pointer type, not width |

Four structural rules constrain all of it:

| Named rule | Statement |
|---|---|
| Unbroken Height | `html`, `body`, `#root` and `main` all assert `height: 100%`. Do not add a wrapper to that chain without giving it a height (`base.css:8-17`) |
| Scroll-Inside | wide or long content scrolls inside its own container and never the page — tables with `overscroll-behavior-x: contain`, code blocks horizontally, and in the control dialog only the checklist while the header and actions stay pinned |
| Fixed-Geometry Overlay | overlays inside the exam screen are out of flow and never flex children, because `.desktop-pane` carries noVNC's `ResizeObserver` and any sibling geometry change costs a framebuffer round-trip |
| Table-Cell | never `display: flex` on a `<td>` or `<th>`. The cell leaves the table layout model, stops stretching to the row height and steps its `border-bottom` off its neighbours'; put the flex on a wrapper inside |

## Elevation and depth

Tone first, shadow only for what floats. Three surface tones separated by
1px hairlines carry depth, so the system is flat at the page level, and
shadow is tinted to the page rather than pure black. Dark keeps the same
three roles with black at 0.30–0.55 alpha.

| Token | Sites |
|---|---|
| `--shadow-1` | `.score-banner` |
| `--shadow-2` | `.start-card`, `.boot-panel`, `.toast`, `.desktop-required-card`, `.job-chip` |
| `--shadow-3` | `.confirm-dialog`, `.control-dialog`, `.info-drawer`, `.clipboard-panel` / `.keyboard-popover`, and `.question-panel` once it becomes an overlay under 900px |

**The Float-Only Rule.** Anchored to the page: tone and a hairline
border. Floating above it: exactly one of the three shadows — no
hover-lift, no raised button, no resting elevation in normal flow.

| Layer | Value | Occupant |
|---|---|---|
| `--z-panel` | 10 | floating controls, the question panel as a drawer, the clipboard panel, the keyboard popover, the focused skip link |
| `--z-dialog` | 20 | the confirm dialog and the About drawer |
| `--z-overlay` | 30 | the control overlay |
| `--z-toast` | 40 | the toast layer and the top progress bar |

The control overlay sits above dialogs because it blocks a destructive
operation and must survive every screen transition under it; toasts sit
above the overlay so a confirmation is never rendered invisible.

## Shapes

| Token | Value | Use |
|---|---|---|
| `--radius-xs` | 3px | inline `code`, which is also every click-to-copy value. A box sized to a few characters needs a corner proportional to itself; nothing with real height takes it |
| `--radius-s` | 6px | anchored things: buttons, bank cards, inset panels, code blocks, question rows and tiles, the timer chip, toasts, mode options, clipboard fields |
| `--radius-m` | 10px | floating things: `.start-card`, `.confirm-dialog`, `.control-dialog`, `.boot-panel`, `.desktop-required-card`, `.score-banner`, `.clipboard-panel` / `.keyboard-popover` |
| `--radius-pill` | 999px | status objects read rather than pressed: `.bank-badge`, `.question-points`, `.instance-chip`, `.mode-chip`, `.domain-bar`, `.pending-bar`, `.job-chip-bar`, plus `.info-button` (28×28, so genuinely circular) and `.theme-toggle` (pill radius on `0.25em 0.9em` of padding, so a lozenge) |

A new component picks from those four. One departure: below 600px,
full-bleed sheets drop to radius 0, because a sheet that reaches every
edge should not pretend to have corners. Form language is otherwise
rectilinear — no angles, no clipping, no asymmetric corners — with two
functional exceptions, the 50% circles behind the intro card's region
numbers and the rotating arc on a running rebuild phase.

## Components

Quiet at rest, decisive on state. Every component rests as a bordered
neutral surface and declares itself only when reached for.

### Buttons

6px corners, `0.5em 1.1em` of em padding so the control scales with its
own type, weight 600.

| State | Treatment |
|---|---|
| Default | `--surface-raised` fill on a `--border-strong` hairline, ink label |
| Hover | the *fill* steps to `--raised-hover` and the label goes `--accent-strong`; the border does not move, so a hovered button is never mistaken for a selected one |
| Pressed | the hover fill plus `translateY(1px)` over 50ms, on every control and not only `.btn` |
| Primary | accent fill, `--accent-contrast` label, hover deepening to `--accent-strong`. Exactly one per screen |
| Danger | danger border and label on the default fill; hover fills danger with surface-coloured text. The only control that fills on hover, because End Exam is irreversible and should feel like it commits |
| Disabled | `--text-disabled` label, `--border` edge, `cursor: not-allowed`. Never `opacity` |
| Focus | the global 2px `--focus-ring` outline at 2px offset, `:focus-visible` only, in both themes |

### Chips, badges and cards

| Component | Treatment |
|---|---|
| Instance chip | which box to ssh into, the most load-bearing fact per question. Mono, accent text on `--accent-soft`, accent border, pill — the only pill with a full accent treatment |
| Bank badge | `--text-xs` uppercase, pill, accent text and border, and no background of its own: it sits on the card's fill. `--accent-strong` on the active card, where the wash drops plain accent to 4.0:1; muted ink and `--border` on an unavailable one |
| Points counter | mono, muted ink, hairline on the page fill, pill. Goes accent when its row is selected |
| Mode chip | the topbar's name for any attempt that is not a plain exam, so a training result is never mistaken for a real one |
| Card fill | `--surface` for cards that float, `--bg` for panels inset *within* a card — an inversion that reads correctly because the page tone is darker than the card in light and lighter in dark |
| Card padding | `--space-6` on the lobby card, `--space-5` on dialogs and the drawer, `--space-3`/`--space-4` on dense containers; one step less below 600px |
| Bank card states | rest on the page fill with a `--border-strong` hairline, hover steps the fill, and the active exam takes an accent border, `--accent-soft` *and* a 3px inset bar |
| The Legible Refusal | an unavailable exam is not a disabled control but a refusal with a reason, and the reason is the point of rendering it. `--text` for the title, `--text-muted` for the meta and reason line, and unavailability marked by `disabled`, `cursor: default`, a muted badge and an italic reason — never by opacity |

### Form controls

Four exist. The candidate's real input surface is the terminal, so the
browser UI only starts, ends, navigates and reports; a new screen
reaching for a field is probably solving the wrong problem. All four
borrow the anchored idioms — 6px corners, a hairline border, a
`--surface-raised` fill, the global focus ring — and a fifth would too.

| Control | Site | Treatment |
|---|---|---|
| Radio group | mode picker, `screens/Start.tsx:252` | native `<input type="radio">` inside a `<label>` row, in a borderless `<fieldset>` whose `legend` is `--text-s` muted. `.mode-option` is 6px on `--border`, hover steps the fill, and the chosen row takes an accent border plus `--accent-soft` |
| Textarea | clipboard panel, `components/ClipboardPanel.tsx:87` | `.clipboard-input` — mono at `--text-s`, `--surface-raised` fill, `--border` hairline, 6px, `resize: vertical` |
| Checkbox ×2 | keyboard settings, `components/KeyboardSettings.tsx:49` and `:60` | native and unstyled, in a `.keyboard-row` flex row beside a `--text-s` label. The second is `disabled` while the first is off |

### Icons

Fifteen hand-authored SVGs in `ui/src/components/Icon.tsx` on a 24 grid,
`fill: none`, `stroke: currentColor`, stroke-width 1.75, round caps and
joins — the conventions `ui/public/favicon.svg` was already drawn with:
`chevron-left`, `chevron-right`, `chevron-down`, `panel-collapse`,
`panel-expand`, `check`, `cross`, `flag`, `flag-filled`, `copy`,
`keyboard`, `theme-auto`, `theme-light`, `theme-dark`, `help`.

Sized on `1em`, so an icon rides the type it sits in, and `currentColor`
throughout, so both themes and every state colour come free. Always
`aria-hidden` by construction: `Icon` takes no label prop, which is what
stops a later call site from making an icon load-bearing.

**The Arrow Vocabulary.** Three roles, one shape family.

| Meaning | Icon | Rotates |
|---|---|---|
| Step to a sibling (previous / next question) | `chevron-left` / `chevron-right` | no |
| Expand or collapse a disclosure in place | `chevron-down` | 180° on open |
| Collapse a panel sideways | `panel-collapse` / `panel-expand` | no |

The rotating chevron is load-bearing: it lets an expanded disclosure drop
the accent border that was byte-identical to the current question tile's.

### Navigation

There is no site nav. What stands in for it:

| Element | Treatment |
|---|---|
| Topbar (exam only) | `--surface` under a hairline bottom border, wrapping rather than compressing, title flexing from an 8rem basis and ellipsing |
| Question navigator | one header row — prev, the current question's id and points, next — above the pane, with the instance chip and the review-mark toggle on a second row |
| Jump grid | a full-panel disclosure of every question as mono tiles auto-filled from a 4.25rem minimum, grouped under their curriculum domain, which is where the long domain string gets a full line. No scrim, no `role="dialog"`, no focus trap: dimming a live remote desktop to pick question 12 would read as a fault |
| Floating controls | theme toggle and info button, fixed top-right in one flex cluster so their spacing comes from layout rather than a guessed offset |
| Skip link | the `.sr-only` clip idiom, never a transform; on focus it becomes `position: fixed`, so its visible state is anchored to the viewport rather than to the pane it lives in |

**Tile states — four states, four channels, no two sharing a value.**
Unopened takes `--border`, opened `--border-strong`, hover moves the fill
and never the edge, and the current tile takes the accent edge plus
`--accent-soft` plus a 3px inset bar, with `aria-current="true"`. The
inset bar is mandatory: it is the channel that survives greyscale and
colour-blindness, so selection can never be reduced to an accent border.
A review mark adds a flag icon; both flags are scoped to one attempt in
`sessionStorage` and never labelled "answered", because the UI knows it
rendered the text, not that the work was done.

**Keyboard accelerators.** `[` and `]` step between questions and `?`
opens the shortcut reference. Bare keys are safe because both handlers
stand down on `target?.closest("input, textarea, [contenteditable]")`
(`QuestionPanel.tsx:101`, `Exam.tsx:175`), inside `.desktop-pane` where
the RFB canvas owns the keyboard, and while a dialog is open. Alt+arrows
were rejected: those are Back/Forward on Windows and Linux, and in a
router-less SPA Back leaves a running exam.

## Motion

| Token | Value | Use |
|---|---|---|
| `--dur-quick` | 160ms | hover and state transitions, the scrim fade, the chevron rotation |
| `--dur-base` | 220ms | the screen fade-up, toasts, checklist rows |
| `--dur-modal-in` | 280ms | dialogs and the drawer |
| `--dur-progress` | 400ms | the determinate job bar, whose step has to be legible as a movement rather than a redraw |

`--ease-out` is `cubic-bezier(0, 0, 0.2, 1)` — decelerating, no
overshoot. A press is a literal 50ms, below the scale's floor on purpose.
There is no exit duration and no ease-in curve: nothing here animates
out, so those tokens were deleted rather than left declared and unused
(`tokens.css:174-177`). Screens fade up 4px, scrims fade, dialogs rise
8px with a 0.99 scale, the drawer slides in 16px, toasts rise 6px, and
checklist rows stagger at 40ms intervals capped at 240ms — on first mount
only, since re-staggering on every poll would make the list feel unstable
for four minutes. Only `transform` and `opacity` are animated, both
compositor-only.

**The Motion-Additive Rule.** Motion is written *inside*
`prefers-reduced-motion: no-preference`, never as a default a
reduce-guard later neutralises, so a reduced-motion user never depends on
an animation being correctly cancelled. Layout must be identical either
way: `.screen` keeps its `height: 100%` outside the media query, and
every keyframe plays forward *to* the element's real style.

**The Non-Motion Channel Rule.** Every pending state carries at least one
channel that changes without motion — an elapsed counter, a step label,
an attempt number. Under `reduce` a stopped `.top-progress-bar` cannot be
told from a decorative border, but a number that ticks reads identically
in both modes.

**The Five Pending Tiers.** A wait belongs to exactly one, and each has
one mechanism, so two never appear for the same work.

| Tier | Mechanism | Means |
|---|---|---|
| Ambient | `TopProgress` / `progressStore` | a foreground request the user is waiting on. Never pollers (`background: true`), never the control job |
| Inline | `<Async loading={…}>` in the region's own box | this region is fetching |
| Blocking | `ControlProgress` | a destructive multi-minute job owns the screen |
| Background | `BackgroundJobChip` | a backgrounded job is still running |
| Gating | `BootProgress` | the environment does not exist yet, so no screen below can be truthful |

Skeletons, not spinners, for the inline tier, and shaped like the content
they stand in for: a block the wrong size for text reads as an empty
region rather than a pending one once the pulse is off.

## Do's and don'ts

### Do

- **Do** define both theme values for every new semantic token in
  `tokens.css`, and record the measured contrast ratio beside it. A token
  that exists in one theme is a bug in the other.
- **Do** use `--accent-strong` for accent-coloured text on `--accent-soft`
  or `--surface-raised`. Plain `--accent` measures 4.0:1 and 4.1:1 there,
  under the floor.
- **Do** reach for tone and a 1px hairline first, and add a shadow only when
  the element genuinely floats above the page.
- **Do** set anything the candidate must type, match, or read as a
  measurement in JetBrains Mono, with `tabular-nums` if it changes over
  time.
- **Do** pick radii from the four that exist: 3px inline chips only, 6px
  anchored, 10px floating, pill for status.
- **Do** write new motion additively inside `prefers-reduced-motion:
  no-preference`, animating only `transform` and `opacity`.
- **Do** change all three mirrors when a colour changes — the Go locked
  page, the favicon, and the terminal palette with its xfconf twin.
- **Do** make wide content scroll inside its own container, and keep pinned
  whatever the user is waiting on.
- **Do** open panels over the exam screen out of flow, never as a flex
  child. Changing `.desktop-pane`'s geometry costs a framebuffer resize
  mid-exam.
- **Do** show a fallback path before it is needed, not after the failure.
  The clipboard panel is always available rather than appearing once
  `readText` has been refused, and the browser-reserved chords are opt-in
  and labelled with their caveat rather than silently enabled and silently
  broken.

### Don't

- **Don't** hardcode a colour in a component. Every value comes from a
  semantic token, without exception.
- **Don't** use the accent as a resting surface. If a screen reads as blue
  before the user touches anything, the accent has become decoration.
- **Don't** add springs, bounces, overshoot, gradient fills, emoji, or a
  celebratory flourish on a pass. The product reports a result; it does not
  congratulate.
- **Don't** build overlay tutorials, spotlight tours, or coach marks
  measured against live layout. Explain a screen with a self-contained
  drawing that holds its own proportions.
- **Don't** let the score page or the lobby drift toward a dashboard — dense
  chrome, charts for their own sake, cards competing for attention. The
  score page is one column, and one number matters.
- **Don't** hide an element with a `transform` when it must be
  keyboard-reachable. Use the `.sr-only` clip idiom.
- **Don't** add a wrapper to the `html`/`body`/`#root`/`main` height chain
  without giving it a height.
- **Don't** let `.desktop-canvas` take its size from its own content. It is
  absolutely positioned so noVNC's `ResizeObserver` cannot enter a resize
  feedback loop; that is structural, not stylistic.
- **Don't** add a form control without first checking whether the
  interaction belongs in the terminal. Four exist, and each earned its
  place.
- **Don't** reach for a dropdown, select or menu. The jump grid is this
  product's disclosure pattern and already carries more per option than a
  native select can render — domain grouping with the full string, points,
  and viewed/marked flags.
- **Don't** convey a control's state with `opacity`. It dims the border and
  the focus ring along with the label, and composites to a ratio nobody
  measured. Use `--text-disabled`.

## Enforcement

Nothing enforces this document — no CI check, no stylelint rule, no token
test. Where it disagrees with `ui/src/styles/tokens.css` or
`ui/src/theme.css`, the CSS is right.
