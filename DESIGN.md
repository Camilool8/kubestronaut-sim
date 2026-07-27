---
name: kubestronaut-sim
description: A calm instrument panel for a timed Kubernetes certification exam — Kubernetes blue on cool slate, in matched light and dark themes.
colors:
  bg: "#f7f9fc"
  surface: "#ffffff"
  surface-raised: "#eaeff7"
  border: "#cbd4e1"
  overlay: "rgba(11, 18, 32, 0.55)"
  text: "#1a212b"
  text-muted: "#57626f"
  accent: "#326ce5"
  accent-strong: "#2557c7"
  accent-soft: "#e4ecfd"
  accent-contrast: "#ffffff"
  danger: "#bb3730"
  danger-soft: "#f7dedd"
  warn: "#8a6100"
  success: "#1a7f37"
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
  "7": "3rem"
  "8": "4rem"
components:
  button:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.s}"
    padding: "0.5em 1.1em"
  button-hover:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.accent}"
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
  bank-card-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.s}"
    padding: "0.75rem 1rem"
  badge:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    padding: "0.05em 0.6em"
  instance-chip:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    padding: "0.15em 0.75em"
  timer:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.accent}"
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

**Creative North Star: "The Instrument Panel"**

This is the interface a person looks at while a clock they cannot pause
counts down toward a result that matters to them. Everything in the
system follows from that one fact. It is an instrument panel, not a
product tour: it reports state accurately, it never competes for
attention, and it never performs. The phrasing is the codebase's own —
*"a spring or a bounce reads as unserious"* — and it generalises past
motion into every other decision here.

The philosophy is **restraint as respect**. A candidate under time
pressure has no attention to spare, so the interface spends none of it.
Surfaces are quiet: three cool-slate tones separated by hairline borders,
with the accent held back until the user reaches for something. Type does
the structural work that colour and ornament would do in a louder system.
Motion is short, decelerating, and never overshoots. The result should
feel less like an app and more like well-made equipment — the kind you
stop noticing once you are working.

The one place the system permits intensity is where intensity is
information: the countdown turning red and pulsing under five minutes,
a failed phase in the rebuild checklist, a pass/fail verdict. Those are
readings, not decoration. Everything else recedes.

**Key Characteristics:**

- Kubernetes blue used referentially on cool slate, in two fully
  specified themes — every semantic token has a light *and* a dark value,
  and components never hardcode a colour.
- Contrast is a ledger, not an intention: every text pairing carries its
  measured ratio in a comment beside the token.
- Monospace is a semantic choice — it marks anything the candidate must
  type, match, or trust as a measurement.
- Tone and hairline borders carry depth; shadow is reserved for things
  genuinely floating above the page.
- Motion is written additively inside `prefers-reduced-motion:
  no-preference`, so the calm state is the default rather than the
  fallback.
- No text inputs exist anywhere in the product. Real input happens in the
  terminal.

## Colors

A cool, low-temperature palette: one referential blue against slate
neutrals that never drift warm, tuned so the same semantic token works in
both themes.

The frontmatter carries the **light** theme, which is the `:root`
default. Every token below also lists its dark counterpart, defined in
`ui/src/styles/tokens.css` under `[data-theme="dark"]` and mirrored into
the `prefers-color-scheme` block for the "system" setting. Neither theme
is a derivation of the other; both are authored.

### Primary

- **Kubernetes Blue** (`#326ce5` light / `#7aa2f7` dark): the accent, and
  a state signal rather than a surface. It appears on hover borders,
  focus rings, the selected question, the running phase, the countdown at
  rest, links, and the primary button's fill. The dark value is a tint,
  not the same hex — `#326CE5` itself reaches only ~4.1:1 on the dark
  background and would fail as body text.
- **Deep Kubernetes Blue** (`#2557c7` light / `#a4c0fb` dark): the
  substitute accent for text sitting on `accent-soft` or
  `surface-raised`, where the plain accent falls under the contrast
  floor. Code-block keywords and the active bank badge use it.
- **Blue Wash** (`#e4ecfd` light / `#16294a` dark): the accent as a fill —
  the active bank card, the instance chip, a hovered click-to-copy value.
  Never carries plain-accent text.
- **Accent Contrast** (`#ffffff` light / `#0b1220` dark): text on a filled
  accent surface. The primary button only.

### Neutral

- **Cool Paper** (`#f7f9fc` light) / **Deep Space Navy** (`#0b1220` dark):
  the page. Also the resting fill for inset panels — bank cards, the
  stats block, inline code.
- **Card White** (`#ffffff` light) / **Console Slate** (`#121a2b` dark):
  raised surfaces — the lobby card, dialogs, the drawer, the topbar,
  toasts, the question panel.
- **Cool Mist** (`#eaeff7` light) / **Slate Raised** (`#1a2437` dark): the
  third tone — the default button fill, fenced code-block bodies, the
  selected question row, the timer's own chip.
- **Hairline** (`#cbd4e1` light / `#28324a` dark): every border in the
  system, always 1px.
- **Ink** (`#1a212b` light / `#d9dee5` dark): body text. 15.4:1 on the
  page in light, 13.9:1 in dark.
- **Muted Ink** (`#57626f` light / `#97a0af` dark): secondary text —
  labels, metadata, command output, hints. 5.9:1 and 7.1:1 on the page.
- **Scrim** (`rgba(11, 18, 32, 0.55)` light / `rgba(2, 6, 16, 0.66)`
  dark): behind dialogs, the drawer, and the control overlay.

### Semantic

- **Signal Red** (`#bb3730` light / `#e5605a` dark): the End Exam button,
  a failed check, a failed phase, the countdown under five minutes.
  Paired with **Red Wash** (`#f7dedd` / `#3d1a18`) for fills.
- **Signal Amber** (`#8a6100` light / `#e0a850` dark): warning toasts —
  the 30/15/5-minute marks. Warning only; never a fill.
- **Signal Green** (`#1a7f37` light / `#57d183` dark): a passed check and
  a passing verdict. It never appears before a result exists.

### Named Rules

**The Contrast Ledger Rule.** Every text-on-background pairing carries
its measured ratio in a comment beside the token in `tokens.css`. A
pairing that lands under 4.5:1 gets a substitute token, never a waiver —
which is why `accent-strong` exists at all. `axe` runs in the test suite
but jsdom has no layout engine, so the colour-contrast rule is skipped
there: the ledger *is* the check, and it is re-verified by hand whenever
a value moves.

**The Rare Accent Rule.** The accent is earned, not applied. At rest, a
screen is slate and ink; blue arrives on hover, focus, selection, live
progress, and exactly one filled button. If a new screen reads as blue
before the user touches it, the accent has been used as decoration.

**The Three Mirrors Rule.** These values live in three places outside
`tokens.css` — the Go locked page (`facilitator/internal/desktop/proxy.go`),
the favicon (`ui/public/favicon.svg`), and the exam terminal's palette
(`images/desktop/assets/terminalrc` plus its xfconf twin). A colour
change is never a one-file change. The candidate sees the same palette in
the browser chrome and inside the terminal they are working in.

**The No Marks Rule.** The blue is referential; the marks are not
borrowed. No Kubernetes or CNCF logo, wordmark, or mark appears anywhere
in the product, and the non-affiliation notice stays in the lobby footer
and the About panel.

## Typography

**Display Font:** JetBrains Mono (with `ui-monospace`, SFMono-Regular,
Menlo, Consolas)
**Body Font:** IBM Plex Sans (with `system-ui`, -apple-system, Segoe UI)
**Label/Mono Font:** JetBrains Mono — the same family as Display; this
system has one mono voice, used at several sizes.

**Character:** Two workhorses, neither of them decorative. IBM Plex Sans
is an engineering typeface with enough humanist warmth to read calmly at
15px for two hours; JetBrains Mono is a terminal face doing terminal
work. Both are bundled via `@fontsource` and served locally — no CDN, no
network dependency at exam time. The pairing carries the whole identity;
there is no third face and no display font in the decorative sense.

### Hierarchy

- **Display** (JetBrains Mono 700, 3.25rem, 1.1, tabular): exactly one
  use — the score percentage. It is the largest thing in the product
  because it is the only number the candidate came for.
- **Headline** (IBM Plex Sans 700, 1.75rem, 1.25, -0.01em): the lobby
  card's exam title. One per screen.
- **Title** (IBM Plex Sans 700, 1.375rem, 1.25, -0.01em): the pass/fail
  verdict (tracked out to 0.12em), the desktop-required heading, dialog
  and drawer headings.
- **Body** (IBM Plex Sans 400, 0.9375rem/15px, 1.55): everything else.
  15px, not 16px — the question panel is 360px wide and shares the
  screen with a terminal, so the base size is set for a dense two-pane
  layout rather than an article.
- **Label** (IBM Plex Sans 600, 0.75rem, 0.06em, uppercase): section
  headings in the lobby, stat labels, table column heads, the code-block
  language tag (0.08em). Always uppercase, always tracked out, always
  muted. One documented value sits off this ramp: the bank badge at
  0.68rem, sized to ride inside a pill next to a 15px title without
  crowding it. It is a one-off, not a step — nothing else may use it, and
  a second use means it should become a real role.
- **Data** (JetBrains Mono 700, 1.125rem, 0.03em, tabular): the
  countdown, stat values, question ids and points, phase elapsed times,
  the live output tail (at 0.75rem).

### Named Rules

**The Mono-For-Truth Rule.** JetBrains Mono marks anything the candidate
must type, match, or trust as a measurement: resource names, ids, points,
durations, paths, command output, the score. IBM Plex Sans is for prose
that explains. The test is mechanical — *if a value could be pasted into
a terminal, or compared digit by digit, it is mono.* This is why every
click-to-copy value in a question is mono: the font is the affordance.

**The Tabular Rule.** Anything that ticks uses `font-variant-numeric:
tabular-nums` — the countdown, the control-job elapsed clock, per-phase
timings. A digit that changes width makes a stable reading look unstable,
and the countdown is on screen for two hours.

## Layout

**The spatial model is two panes and a stack.** The exam screen is a
fixed 360px question panel beside a fluid desktop viewport, under a
wrapping topbar. Every other screen is a single centred column: the lobby
card at `min(680px, 100%)`, the score page at 820px, the About drawer at
`min(480px, 92vw)`, the confirm dialog at `min(440px, 90%)`, the control
dialog at 520px. Nothing is full-bleed except the exam itself.

**Spacing** is an eight-step rem scale (0.25 / 0.5 / 0.75 / 1 / 1.5 / 2 /
3 / 4rem). Cards take `space-6` (2rem) of internal padding at desktop and
drop to `space-4` (1rem) below 600px; dialogs take `space-5`; dense rows
(question items, table cells) take `space-1`–`space-2`. Density is
deliberately higher inside the exam than on the lobby and score screens,
which is the correct inversion: one is a working surface, the others are
reading surfaces.

**Responsive behaviour** has three real breakpoints, and each one changes
structure rather than scale:

- **≤900px** — the question panel leaves the flow and becomes an overlay
  drawer (`min(85vw, 360px)`, `shadow-3`), leaving a 36px collapsed rail
  the desktop pane sits beside. The two-pane model stops being viable
  before the panel stops being readable.
- **≤600px** — dialogs go full-bleed (width 100%, `max-height: 100dvh`,
  radius 0) rather than shrinking a desktop dialog onto a phone. Lobby
  actions stack full-width; the score row lets the domain wrap to its own
  line.
- **`any-pointer: coarse`** — icon controls (panel toggle, info button)
  grow to a 44px minimum. Keyed to pointer type, not width.

**The exam has a capability floor, not a width floor.** Below it, the
desktop-required screen is *the page* — a real, complete screen that must
stay usable at 320px, because WCAG 1.4.10 counts 320px as a 1280px window
at 400% zoom. A running session stays submittable from it: the
server-side clock does not care what the candidate is holding.

### Named Rules

**The Unbroken Height Rule.** `html`, `body`, `#root` and `main` all
assert `height: 100%`. A percentage height resolves to `auto` the moment
one ancestor in the chain is content-sized, and every full-height screen
depends on that chain being intact. Do not add a wrapper element to the
chain without giving it a height.

**The Scroll-Inside Rule.** Wide or long content scrolls inside its own
container, never the page: tables get `overflow-x: auto` with
`overscroll-behavior-x: contain`, code blocks scroll horizontally within
the block, and in the control dialog only the checklist scrolls while the
header and actions stay pinned — the progress a user is waiting on must
never scroll out of view.

## Elevation & Depth

**Tone first; shadow only for what floats.** Depth is carried primarily
by three surface tones (`bg` → `surface` → `surface-raised`) separated by
1px hairline borders. That is how panels, rows, code blocks, inset stat
blocks and buttons establish themselves — the system is essentially flat
at the page level.

Shadow is reserved for elements genuinely above the page, and it is
tinted to the page rather than pure black (`rgba(16, 24, 40, …)` in
light, and pure black at higher alpha in dark, where the ambient is
already near-black).

### Shadow Vocabulary

- **shadow-1** (`0 1px 2px rgba(16,24,40,0.08), 0 1px 6px rgba(16,24,40,0.06)`):
  the faintest lift. The score banner only.
- **shadow-2** (`0 4px 12px rgba(16,24,40,0.10), 0 2px 4px rgba(16,24,40,0.08)`):
  the standard card lift — the lobby card, the desktop-required card,
  toasts.
- **shadow-3** (`0 12px 32px rgba(16,24,40,0.16)`): modal depth — confirm
  dialog, control dialog, the About drawer, and the question panel once
  it becomes an overlay under 900px.

Dark theme keeps the same three roles with black at 0.30–0.55 alpha.

### Named Rules

**The Float-Only Rule.** If an element is anchored to the page, it gets
tone and a hairline border. If it floats above the page — a card, a
dialog, a drawer, a toast — it gets exactly one of the three shadows.
There is no hover-lift, no raised button, no resting elevation on
anything in normal flow.

**The Hairline Rule.** Every surface declares its edge with a 1px
`border`. This system has no borderless floating cards; the border does
the work that a heavier shadow would do elsewhere, which is what keeps
the flat state readable in both themes.

## Shapes

A single soft radius system, deliberately small. **6px** (`radius-s`) is
the default for controls and anything anchored: buttons, bank cards,
inset panels, code blocks, question rows, the timer chip, toasts, the
focus ring's own corner. **10px** (`radius-m`) belongs to things that
float: the lobby card, dialogs, the desktop-required card. **Pill**
(`999px`) is reserved for status objects that are read rather than
pressed — badges, the points counter, the instance chip — plus the two
circular icon controls (theme toggle, info button).

Form language is rectilinear and calm: no angles, no clipping, no
asymmetric corners, no decorative shapes. Two geometric exceptions exist,
both functional — the 50% circles behind the intro card's region numbers,
and the rotating arc that marks a running rebuild phase.

### Named Rules

**The Two-Radius Rule.** Anchored gets 6px, floating gets 10px, status
gets pill, and a new component picks from those three rather than
introducing its own. Exactly two exceptions are documented, and a third
should not be added: inline `code` uses **3px**, because a box sized to a
few characters needs a corner proportional to itself rather than to a
button; and below 600px full-bleed dialogs drop to **radius 0** — a sheet
that reaches every edge should not pretend to have corners.

## Components

Character line for the whole set: **quiet at rest, decisive on state.**
Every component rests as a bordered neutral surface and declares itself
only when the user reaches for it. The accent is the state; it is almost
never the resting style.

### Buttons

- **Shape:** softly rounded (6px), padded in em so the control scales
  with its own type (`0.5em 1.1em`), weight 600.
- **Default:** cool-mist fill on a hairline border, ink text. On hover,
  border *and* text both go accent while the fill stays put — the button
  brightens rather than filling in.
- **Primary:** accent fill, accent-contrast text; hover deepens to
  `accent-strong`. Exactly one per screen — Start Exam, New Attempt,
  Retry, Got It.
- **Danger:** danger border and text on the default fill; on hover it
  fills danger with surface-coloured text. This inversion is the only
  place in the system where a control fills on hover, and it is
  deliberate: End Exam is irreversible and should feel like it commits.
- **Active:** `translateY(1px)` over 50ms. A press, not a bounce.
- **Disabled:** 0.5 opacity, `cursor: not-allowed`. No colour change.
- **Focus:** the global 2px `focus-ring` outline at 2px offset, on every
  interactive element in both themes, `:focus-visible` only.

### Chips & Badges

- **Instance chip:** the single most load-bearing fact per question — which
  box to ssh into. Mono, accent text on blue wash, accent border, pill.
  The only pill in the system that carries a full accent treatment.
- **Bank badge:** uppercase label type, pill, accent text and border on
  the card's own background. On the active card it switches to
  `accent-strong` (the wash underneath makes plain accent fall to 4.0:1);
  on a disabled card it drops to muted ink and a hairline border.
- **Points counter:** mono, muted ink, hairline border on the page fill,
  pill. Goes accent when its row is selected.

### Cards & Containers

- **Corner Style:** 10px for the lobby and gate cards; 6px for bank
  cards, stat blocks, question results, code blocks.
- **Background:** `surface` for cards that float; `bg` for panels inset
  *within* a card — an inversion that reads correctly because the page
  tone is darker than the card in light and lighter in dark.
- **Shadow Strategy:** `shadow-2` on floating cards, `shadow-1` on the
  score banner, none on inset panels. See Elevation.
- **Border:** always 1px hairline, including on shadowed cards.
- **Internal Padding:** `space-6` (2rem) on the lobby card, `space-5` on
  dialogs and the drawer, `space-3`/`space-4` on dense containers;
  everything drops one step below 600px.
- **Bank card states:** rest on page fill with a hairline; hover takes the
  border to accent; the active exam takes an accent border *and* blue
  wash; unavailable exams sit at 0.72 opacity with `cursor: default` and
  an italic reason line — disabled but still legible, because the reason
  is the point.

### Inputs / Fields

**This product has none, and that is a system fact rather than a gap.**
There is no text field, select, or textarea anywhere in the UI: the
candidate's real input surface is the terminal on the exam desktop, and
the browser UI only starts, ends, navigates, and reports. A new screen
that reaches for a form field is almost certainly solving the wrong
problem — check whether the interaction belongs in the terminal first. If
a field ever becomes genuinely necessary, it inherits 6px corners, the
hairline border, `surface-raised` fill, and the global focus ring; do not
invent a second focus treatment for it.

### Navigation

There is no site nav — this is a four-state machine (lobby → exam → score,
plus the desktop-required gate), not a navigable app. What stands in for
it:

- **Topbar** (exam only): `surface` fill under a hairline bottom border,
  wrapping rather than compressing, with the title flexing from an 8rem
  basis and ellipsing.
- **Question list:** a scrolling list capped at 45% of the panel, rows
  transparent at rest with a transparent border that goes hairline on
  hover; the selected row takes `surface-raised` and an accent border.
- **Floating controls:** theme toggle and info button, fixed top-right in
  one flex cluster so their spacing comes from layout rather than a
  guessed offset.
- **Skip link:** clipped with the `.sr-only` idiom — never a transform,
  which is proportional to the element's own height and is how it once
  ended up 21px visible under the topbar. On focus it becomes `position:
  fixed` so its visible state is anchored to the viewport, not to the
  pane it lives in.

### Signature: the click-to-copy value

Every inline value in a question is a button. It has to read as part of
the sentence rather than as a control, so it borrows the inline-code look
exactly and reveals its affordance only on hover or focus: the code
border goes accent, the fill goes blue wash, the text goes
`accent-strong`, and a copy glyph fades in from `opacity: 0`. Nothing
about the resting state announces that it is interactive except the mono
font — which, under the Mono-For-Truth Rule, already means "this is a
literal value". It is the clearest expression of the whole system:
invisible until reached for, unambiguous once touched.

### Signature: the rebuild checklist

A cluster rebuild takes minutes, so the control dialog is built to be
watched. Each row is a three-column grid (`1em | 1fr | auto`) — mark,
label, elapsed — with the running phase's live command output spanning
underneath in mono at 0.75rem, clipped to one line so a long line cannot
reflow the dialog on every poll. Phase colour carries state: muted at
rest, ink when done, accent while running, danger on failure. The running
phase gets a rotating arc rather than a static glyph, because without
visible motion a four-minute wait reads as frozen — and under reduced
motion the global guard stops the rotation, leaving the arc as a static
marker.

### Signature: the intro schematic

The first-run card explains the four regions of the exam screen with a
*drawing* of that screen, not an overlay on top of it. Every box is sized
in relative units off the dialog's own width, so it holds its proportions
at any viewport and never has to be measured against the live layout —
which is exactly what the spotlight tour it replaced got wrong. The
desktop region is a faint 1.25rem grid: it reads as "something else lives
here" without pretending to be a screenshot.

### Motion

Durations are short and exits are shorter than entrances: 100ms instant,
160ms quick, 220ms base, 280ms modal-in against 200ms modal-out, 400ms
progress. Easing is `cubic-bezier(0, 0, 0.2, 1)` — decelerating, no
overshoot. Only `transform` and `opacity` are animated, both
compositor-only, which matters for an overlay that stays on screen for
minutes.

The vocabulary is deliberately small: screens fade up 4px, scrims fade,
dialogs rise 8px with a 0.99 scale, the drawer slides 16px, toasts rise
6px, and checklist rows stagger in at 40ms intervals capped at 240ms —
staggered on first mount only, since re-staggering on every poll would
make the list feel unstable for four minutes.

**The Motion-Additive Rule.** Motion is written *inside* `@media
(prefers-reduced-motion: no-preference)`, never as a default that a
reduce-guard later neutralises. `base.css` carries the global guard as
well, but authoring additively means a reduced-motion user never depends
on an animation being correctly cancelled and never downloads a frame of
it. Layout must be identical either way: `.screen` carries its
`height: 100%` outside the media query for exactly this reason, and every
keyframe plays forward *to* the element's real style, so a screen that
never runs its animation still ends up visible.

## Do's and Don'ts

### Do:

- **Do** define both theme values for every new semantic token, in
  `tokens.css`, and record the measured contrast ratio beside it. A token
  that exists in one theme is a bug in the other.
- **Do** use `accent-strong` for accent-coloured text on `accent-soft` or
  `surface-raised`. Plain `accent` measures 4.0:1 and 4.1:1 there — under
  the floor.
- **Do** reach for tone and a 1px hairline border first. Add a shadow only
  when the element genuinely floats above the page.
- **Do** set anything the candidate must type, match, or read as a
  measurement in JetBrains Mono, and add `tabular-nums` if it changes over
  time.
- **Do** pick radii from the three that exist: 6px anchored, 10px
  floating, pill for status.
- **Do** write new motion additively inside `prefers-reduced-motion:
  no-preference`, animating only `transform` and `opacity`.
- **Do** keep every user-facing string in `ui/src/strings.ts`.
- **Do** change all three mirrors when a colour changes — the Go locked
  page, the favicon, and the terminal palette with its xfconf twin.
- **Do** make wide content scroll inside its own container, and keep
  pinned what the user is waiting on.

### Don't:

- **Don't** hardcode a colour in a component. Every value comes from a
  semantic token, without exception.
- **Don't** use the accent as a resting surface. If a screen reads as blue
  before the user touches anything, the accent has become decoration.
- **Don't** add springs, bounces, overshoot, gradient fills, emoji, or a
  celebratory flourish on a pass. The product reports a result; it does
  not congratulate. A spring reads as unserious on an instrument.
- **Don't** build overlay tutorials, spotlight tours, or coach marks
  measured against live layout. Explain a screen with a self-contained
  drawing that holds its own proportions.
- **Don't** let the score page or the lobby drift toward a dashboard —
  dense chrome, charts for their own sake, cards competing for attention.
  The score page is one column, and one number matters.
- **Don't** hide an element with a `transform` when it must be
  keyboard-reachable. Use the `.sr-only` clip idiom; a translate is
  proportional to the element's own height and will eventually leak.
- **Don't** add a wrapper to the `html`/`body`/`#root`/`main` height
  chain without giving it a height.
- **Don't** let `.desktop-canvas` take its size from its own content. It
  is absolutely positioned so noVNC's ResizeObserver cannot enter a
  resize feedback loop; that is structural, not stylistic.
- **Don't** introduce a text input reflexively. This product has none, and
  the terminal is where real input belongs.
- **Don't** load a font, stylesheet, or icon from a CDN. Everything ships
  bundled — the exam must not depend on the network.
