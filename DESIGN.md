---
name: kubestronaut-sim
description: A calm instrument panel for a timed Kubernetes certification exam — one blue for action, one cyan for progress, on cool slate, in matched light and dark themes.
colors:
  bg: "#f6f8fc"
  surface: "#ffffff"
  surface-raised: "#eef1f6"
  border: "#d7dde8"
  border-strong: "#708197"
  surface-hover: "#e4e9f2"
  raised-hover: "#e2e7f0"
  overlay: "rgba(16, 23, 40, 0.55)"
  text: "#101728"
  text-body: "#2c3546"
  text-secondary: "#4a5568"
  text-muted: "#5a6478"
  text-subtle: "#5e6878"
  text-disabled: "#818c9e"
  text-decorative: "#8b95a6"
  accent: "#2b5fd9"
  accent-strong: "#1e3f96"
  accent-soft: "#e5ecfd"
  accent-contrast: "#ffffff"
  progress: "#0d93ac"
  progress-strong: "#0a7285"
  progress-soft: "#e2f4f8"
  danger: "#bc382a"
  danger-soft: "#fdf0ee"
  danger-row: "#fffbfa"
  danger-bar: "#d9846f"
  warn: "#a1642a"
  warn-strong: "#925b26"
  warn-soft: "#fdf7ea"
  warn-border: "#e8d6ae"
  warn-marker: "#e8c46a"
  success: "#1f8a54"
  success-strong: "#1b7648"
  success-soft: "#e7f5ee"
  neutral-soft: "#eef1f6"
  muted-soft: "#e4e9f1"
  ink: "#101728"
  ink-text: "#ffffff"
  ink-muted: "#a8b2c4"
  ink-faint: "#8b95a6"
  ink-accent: "#7fa6f5"
  machine-bg: "#0b0f16"
  machine-surface: "#0d1320"
  machine-raised: "#161d2b"
  machine-chrome: "#1b2331"
  machine-border: "#232e40"
  machine-border-strong: "#2a3546"
  machine-text: "#c3ccd9"
  machine-muted: "#9aa7ba"
  machine-faint: "#8593a8"
  machine-green: "#63d68a"
  machine-green-soft: "#8fd6a8"
  machine-blue: "#6f9cf8"
  machine-amber: "#e8c46a"
  focus-ring: "#2b5fd9"
typography:
  display:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "2.125rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontFeature: "tabular-nums"
  headline:
    fontFamily: "IBM Plex Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "IBM Plex Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  body:
    fontFamily: "IBM Plex Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.84375rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "0.625rem"
    fontWeight: 600
    lineHeight: 1.55
    letterSpacing: "0.09em"
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "0.90625rem"
    fontWeight: 600
    lineHeight: 1.55
    fontFeature: "tabular-nums"
rounded:
  xs: "4px"
  s: "6px"
  m: "8px"
  l: "10px"
  xl: "12px"
  pill: "999px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.5rem"
  "6": "2rem"
  "7": "2.5rem"
  "8": "3rem"
  "9": "4rem"
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
    rounded: "{rounded.l}"
    padding: "{spacing.6}"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.l}"
    padding: "{spacing.5}"
  banner:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink-text}"
    rounded: "{rounded.l}"
    padding: "{spacing.7}"
  terminal:
    backgroundColor: "{colors.machine-bg}"
    textColor: "{colors.machine-text}"
    rounded: "{rounded.m}"
    padding: "{spacing.4}"
  verdict-pass:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success-strong}"
    rounded: "{rounded.xs}"
    padding: "0.25em 0.6em"
  verdict-fail:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.xs}"
    padding: "0.25em 0.6em"
  progress-track:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.pill}"
  progress-fill:
    backgroundColor: "{colors.progress}"
    rounded: "{rounded.pill}"
  exam-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "{spacing.5}"
  exam-card-soon:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.xl}"
    padding: "{spacing.5}"
  exam-avatar-practical:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.l}"
  exam-avatar-mcq:
    backgroundColor: "{colors.progress-soft}"
    textColor: "{colors.progress-strong}"
    rounded: "{rounded.l}"
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
  mcq-option:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.s}"
    padding: "0.75rem"
  mcq-option-on:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.s}"
    padding: "0.75rem"
  mode-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "{spacing.5}"
  mode-card-on:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "{spacing.5}"
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
    textColor: "{colors.text}"
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
Cool ink neutrals, hairline borders, one blue held back until the user
reaches for something, one cyan for things that are moving, and type
doing the work ornament would do elsewhere. Intensity is permitted only
where intensity is information — the countdown under five minutes, a
failed phase, a verdict.

One structural idea runs through the whole system: **the machine is not
the app**. Dark surfaces name a computer — the VNC desktop, a terminal,
an ssh block, a captured cluster state. They appear in both themes and
they never follow the app's. Everything the product itself says is said
on a light-mode surface, or in dark on one that keeps its own blue cast.

## Colours

Cool ink neutrals, one blue for action and one cyan for progress. Both
themes are authored; neither is derived from the other. The frontmatter
carries light, the `:root` default; dark comes from
`[data-theme="dark"]`, mirrored into `prefers-color-scheme` for "system".

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#f6f8fc` | `#101728` | the page, and the resting fill for panels inset within a card |
| `--surface` | `#ffffff` | `#182033` | raised surfaces — cards, dialogs, drawer, topbar, toasts, question panel |
| `--surface-raised` | `#eef1f6` | `#212a40` | third tone — default button fill, fenced code bodies, progress tracks, chips |
| `--overlay` | `rgba(16, 23, 40, 0.55)` | `rgba(2, 6, 16, 0.7)` | scrim behind dialogs, drawer, control overlay |
| `--border` | `#d7dde8` | `#3a4560` | structural edges, always 1px |
| `--border-strong` | `#708197` | `#6f7d9f` | control edges, and any border that carries a state |
| `--surface-hover` | `#e4e9f2` | `#1e2739` | hover fill for a control resting on `--surface` or `--bg` |
| `--raised-hover` | `#e2e7f0` | `#283148` | hover fill for a control resting on `--surface-raised` |
| `--text` | `#101728` | `#dfe5ee` | headings, figures, anything load-bearing |
| `--text-body` | `#2c3546` | `#c8d1de` | prose and question bodies |
| `--text-secondary` | `#4a5568` | `#a7b1c2` | supporting copy, card descriptions |
| `--text-muted` | `#5a6478` | `#94a0b2` | meta lines, captions, command output |
| `--text-subtle` | `#5e6878` | `#8e9aac` | the smallest labels that still carry meaning |
| `--text-disabled` | `#818c9e` | `#727d90` | the label of a genuinely inoperable control |
| `--text-decorative` | `#8b95a6` | `#7e8a9d` | marks that repeat information already present. Never label text |
| `--accent` | `#2b5fd9` | `#7ba3f8` | focus, currency, the primary fill, and accent text on any fill |
| `--accent-strong` | `#1e3f96` | `#a8c4fc` | hover and pressed emphasis, and the link hover |
| `--accent-soft` | `#e5ecfd` | `#1b2a4c` | the accent as a fill |
| `--accent-contrast` | `#ffffff` | `#101728` | text on a filled accent surface — the primary button only |
| `--progress` | `#0d93ac` | `#3fc9e0` | progress bars and their dots. Graphics only, never text |
| `--progress-strong` | `#0a7285` | `#7fdcec` | cyan text — the MCQ engine's tint, an in-flight figure |
| `--progress-soft` | `#e2f4f8` | `#0e2e38` | the cyan wash behind a progress label |
| `--danger` | `#bc382a` | `#e97772` | End Exam, a failed check or phase, the countdown under five minutes |
| `--warn` / `--warn-strong` | `#a1642a` / `#925b26` | `#e0a850` / `#eec27f` | graphics / text for a flag or a warning |
| `--warn-marker` | `#e8c46a` | `#e8c46a` | the pass-threshold marker on the results bar. Drawn on `--ink` |
| `--success` / `--success-strong` | `#1f8a54` / `#1b7648` | `#57d183` / `#8ae0a9` | graphics / text for a pass. Never before a result exists |
| `--ink` | `#101728` | `#262f47` | a band that frames a headline — the results banner, the landing hero |
| `--machine-*` | see below | identical | the VNC desktop, terminals, ssh blocks, state-diff panes |
| `--syntax-string` | `#146c43` | `#63d68a` | strings and literals in a fenced block |
| `--syntax-number` | `#8a5200` | `#e8c46a` | numbers in a fenced block |
| `--focus-ring` | `#2b5fd9` | `#7ba3f8` | the 2px focus outline |

Softs and row tints (`--success-soft`, `--danger-soft`, `--danger-row`,
`--warn-soft`, `--neutral-soft`, `--muted-soft`) are fills only; the
token that reads on each is named in `tokens.css`.

**The exam tint names the engine.** `--exam-tint` and `--exam-tint-soft`
are the one alias family in the system: they hold no colour of their own
and are repointed by a `data-engine` attribute on the card. A practical
exam takes the action blue, a multiple-choice one the progress cyan, and
an exam nobody can sit yet is outside the hue system entirely
(`--text-muted` on `--muted-soft`).

Keyed on the engine rather than the certification on purpose. Five
per-certification hues would be five colours that differ without meaning
anything; two engine hues say the same thing the card's own Engine cell
says in words, and they extend without invention when CKA, CKS and KCSA
arrive. Being aliases, they need no dark twin — `var()` in a custom
property is substituted at use time, so the tint resolves through
whichever `--accent` the theme has. `contrast.test.ts` asserts each
variant's foreground reads as text on its own fill, because a variant
repointed at a graphics-only token would be silent everywhere else.

The rules that govern them:

| Named rule | Statement |
|---|---|
| Contrast Ledger | every text pairing carries its measured ratio beside the token, and a pairing under 4.5:1 gets a substitute token rather than a waiver. jsdom has no layout engine, so `axe` skips contrast — but the ledger is no longer the only check: `ui/src/styles/contrast.test.ts` re-derives every ratio from the shipped stylesheet, so a value that drifts from its comment fails the build |
| Rare Accent | blue arrives for four things only — focus, currency (the selected question, the active exam, the running phase), the one filled primary button per screen, and links. Progress is cyan, not blue, which is what lets the two coexist. A screen that reads as blue before it is touched has used it as decoration |
| Two Tiers For One Hue | wherever a hue serves both a bar and a label, the base token is the graphic (3:1) and `-strong` is the text (4.5:1) — `--success`, `--warn`, `--progress`. Using the base for text is the single easiest way to fail AA here, and the contrast test is what catches it |
| The Machine Is Not The App | `--machine-*` is a dark palette that appears in BOTH themes, reserved for things that are literally a computer. Never reach for it to make an app surface look technical. In dark mode the distinction is carried by hue and chrome rather than by lightness (`tokens.css`, header) |
| Hover is not an accent channel | hover is one step of tone and nothing more, so the tile under a cursor never draws the outline that means "the question I am on". Two exceptions: the click-to-copy value, which goes accent on hover because its resting state is a hairline rather than a fill, and the 6px panel resizer, which has no resting box at all |
| Two-Tier Hairline | `--border-strong` if the edge identifies a control's hit area or carries a state, which answers WCAG 1.4.11's 3:1 floor; `--border` for everything structural. This is the one place the design brief was overruled: it draws every border at a value measuring ~1.2:1 (`tokens.css`, borders) |
| Three Mirrors | these values also live in the Go locked page (`facilitator/internal/desktop/proxy.go`), the favicon (`ui/public/favicon.svg`) and the terminal palette (`images/desktop/assets/terminalrc` plus its xfconf twin), so a colour change is never a one-file change. Enforced by `ui/src/styles/mirrors.test.ts`, which was written after the xfconf twin was found to have silently lost its palette |

## Typography

IBM Plex Sans (`system-ui`, -apple-system, Segoe UI) and IBM Plex Mono
(`ui-monospace`, SFMono-Regular, Menlo, Consolas), both bundled via
`@fontsource`. There is no third face in the app. The exam desktop's
terminal is a deliberate exception and stays on JetBrains Mono — Debian
12 ships no IBM Plex package, and the terminal is the machine, not the
app (`images/desktop/Dockerfile`).

Twelve steps, because the brief distinguishes sizes a seven-step scale
collapses: a 10px mono eyebrow and an 11px stat label do different jobs
on the same card.

| Token | Value | Setting | Use |
|---|---|---|---|
| `--text-hero` | 2.625rem / 42px | Sans 600, 1.12, -0.025em | the landing headline. One site |
| `--text-6xl` | 2.125rem / 34px | Mono 600, 1.1, tabular | the results figure — a number, so mono |
| `--text-5xl` | 1.875rem / 30px | Sans 600, -0.022em | the results verdict — prose, so sans |
| `--text-4xl` | 1.625rem / 26px | Sans 600, -0.02em | screen titles |
| `--text-3xl` | 1.375rem / 22px | Sans 600, -0.02em | section headings, boot and gate headings |
| `--text-2xl` | 1.1875rem / 19px | Sans 600, -0.015em | card titles, the verdict word |
| `--text-xl` | 1.0625rem / 17px | Sans 600 | `.md h1`/`h2`, dialog headlines |
| `--text-l` | 0.90625rem / 14.5px | Sans 400 or Mono 600 | option text, `.md h3`; as mono, the countdown and stat values |
| `--text-m` | 0.84375rem / 13.5px | Sans 400, 1.65 | the base. 13.5px and not 15px: the task panel shares the screen with a terminal, and the brief sets its body here |
| `--text-s` | 0.78125rem / 12.5px | Sans or Mono | the secondary step and the busiest non-base size — meta, chips, table cells |
| `--text-xs` | 0.6875rem / 11px | Sans or Mono | stat labels, legends, option letters |
| `--text-2xs` | 0.625rem / 10px | Mono 600, `--tracking-label`, uppercase | eyebrow labels. Unreadable without the tracking, which is why it is a token |

The top steps have one or two sites each. A type scale is a set of
permissions, not a set of quotas.

**The Mono-For-Truth Rule.** IBM Plex Mono marks anything the candidate
must type, match, or trust as a measurement — names, ids, points,
durations, paths, output, the score. The test is mechanical: if a value
could be pasted into a terminal or compared digit by digit, it is mono.

**The Tabular Rule.** Anything that ticks takes `font-variant-numeric:
tabular-nums`. A digit that changes width makes a stable reading look
unstable, and the countdown is on screen for two hours.

**The Three-Colour Syntax Rule.** A fenced block colours keys and
keywords in `--accent-strong`, strings in `--syntax-string` and numbers
in `--syntax-number`; comments take `--text-muted` and italics, and
everything else inherits (see the `.hljs-*` rules in `theme.css`). In
dark, the two value hues are `--machine-green` and `--machine-amber` —
literally the exam terminal's own green and amber — so the same YAML
reads identically in the question panel and in the candidate's vim.
`mirrors.test.ts` asserts that equality rather than trusting it.

## Layout

Two panes and a stack: a resizable question panel beside a fluid desktop
viewport under a wrapping topbar, and a single centred column everywhere
else. There are seven full-page surfaces — `screens/Exams.tsx`,
`screens/Mode.tsx`, `screens/Exam.tsx`, `screens/McqExam.tsx`,
`screens/Score.tsx`, `screens/BootProgress.tsx` and
`components/DesktopRequired.tsx` — the first two under `.app-header`,
the rest owning their whole viewport.

| Surface | Width |
|---|---|
| Exam and mode pages | `--page-max` (1160px), centred |
| MCQ question column | `--mcq-measure` (720px), centred |
| Task pane (hands-on) | `--task-pane-width` (420px) as the design's figure; `PanelResizer` writes `--panel-width` and clamps 280–600px, so the candidate's dragged width wins |
| Results sidebar | `--results-sidebar` (340px) |
| Score page | `max-width: 820px` |
| About drawer | `min(480px, 92vw)` |
| Confirm dialog | `min(440px, 90%)` |
| Wide confirm dialog | `min(560px, 92%)` |
| Exam tips sheet | `min(760px, 94%)` — a dialog that is READ rather than answered. 560px is the measure for a sentence and two buttons; the tips are pipe tables and long command lines, and at that width every one of them wraps |
| Control dialog | `min(92vw, 520px)` |
| Boot panel | `min(94vw, 560px)` |
| Desktop-required card | `min(34rem, 100%)` |
| Clipboard panel, keyboard popover | `min(92vw, 380px)` |
| Toast layer | `min(380px, calc(100vw - 2rem))` |

**Spacing** is nine steps, `--space-1` to `--space-9`: 0.25 / 0.5 / 0.75 /
1 / 1.5 / 2 / 2.5 / 3 / 4rem. Cards and dialogs take `--space-5`, page
gutters `--space-5` closing to `--space-4` below 600px, dense rows
`--space-1`–`--space-2`. Density is deliberately higher inside the exam
than on the selector and score screens: one is a working surface, the
others are reading surfaces.

**The panel edge is draggable.** `.question-panel` is `clamp(280px,
var(--panel-width, 360px), min(600px, 50vw))`, and `PanelResizer` — a
`role="separator"` operable by pointer and by keyboard — writes that
custom property. Not an inline `width`: an inline style beats a class
rule, so a persisted width would win over the clamp.

| Number | Meaning |
|---|---|
| 280px | where the nav row stops fitting. The navigator halves to five columns just above it, on a container query at 320px — ten tiles that narrow clip their own labels |
| 360px | the default |
| 600px | a measure decision: 568px of text at the 15px base is about 75ch, and 700px would be ~90ch |
| 50vw | narrows the panel as the window narrows, without touching the stored preference. No listener, no JS |

There is deliberately no automatic widening: growing a reading measure
under someone mid-question moves text while they read it. The resizer
holds noVNC's `resizeSession` false for a gesture, and is suppressed
below 900px where the panel leaves the flow.

Six breakpoints, each changing structure rather than scale:

| Query | Change |
|---|---|
| `max-width: 1100px` | the deep dive's two document panes stack in reading order |
| `max-width: 900px` | the question panel leaves the flow and becomes an overlay drawer at `min(85vw, 360px)` with `--shadow-3`, over a 36px collapsed rail; the results card and the dashboard go to one column |
| `max-width: 48rem` | the app header collapses: the crumb, the rule, the detail and the wordmark's tail go, and the nav moves into `HeaderMenu`. Mirrored by `HEADER_COMPACT_QUERY`, which decides what is in the DOM while this only dresses what is left |
| `max-width: 640px` | **the mobile line.** The reading type steps up (`--text-m` to 15px, `--text-l` to 16px, `--text-xl` to 18px); the exam topbar collapses to a clock and an overflow sheet; the mcq footer becomes a thumb-zone action bar and its navigator a modal sheet; the header menu becomes a sheet; the mcq head row splits in two; every page pays `--safe-b`; the task-verdict strip and the path cards stack. Mirrored by `MCQ_COMPACT_QUERY` |
| `max-width: 600px` | dialogs and the boot panel go full-bleed (width 100%, `max-height: 100dvh`, radius 0), the clipboard panel and keyboard popover become bottom sheets, the page gutters close a step, the mode screen's fine print stacks, and the domain table's cells become blocks |
| `any-pointer: coarse` | icon controls and the panel's `--control-size` go from 28px to a 44px minimum, and press states appear. Keyed to pointer type, not width |

`hover: none` is a seventh query and asks a different question from
`any-pointer: coarse`: whether a pointer can rest on something without
pressing it. It governs STATE where coarse governs SIZE, and conflating
them is how a touchscreen laptop loses its hover styling for having a
touchscreen.

Five structural rules constrain all of it:

| Named rule | Statement |
|---|---|
| Unbroken Height | `html`, `body`, `#root` and `main` all assert `height: 100%`, and the first three assert `100dvh` after it. Do not add a wrapper to that chain without giving it a height, and do not reorder those two declarations — mobile Safari resolves a percentage against the LARGE viewport, so `100%` is the fallback a browser keeps when it cannot parse `dvh` (`base.css:8-17`, pinned by `layout.test.ts`) |
| Reflow Floor | never a bare length as an `auto-fit` minimum. `minmax(330px, 1fr)` builds a 330px track inside a 305px viewport, because minmax's minimum is a floor and not a preference — which is a horizontally scrolling page at the 320px WCAG 1.4.10 width. Always `minmax(min(Npx, 100%), 1fr)` |
| Scroll-Inside | wide or long content scrolls inside its own container and never the page — tables with `overscroll-behavior-x: contain`, code blocks horizontally, and in the control dialog only the checklist while the header and actions stay pinned |
| Fixed-Geometry Overlay | overlays inside the exam screen are out of flow and never flex children, because `.desktop-pane` carries noVNC's `ResizeObserver` and any sibling geometry change costs a framebuffer round-trip |
| Table-Cell | never `display: flex` on a `<td>` or `<th>`. The cell leaves the table layout model, stops stretching to the row height and steps its `border-bottom` off its neighbours'; put the flex on a wrapper inside |

## Mobile

A phone is not a narrow desktop. It is a different set of capabilities,
and the product's answer to that is two-sided: it refuses the exam that
genuinely cannot work there, and it is built for the one that can.

**The refusal.** A hands-on attempt is a question panel beside a live
Linux desktop over VNC. It needs a physical keyboard and room for two
panes, so a touch-only device is refused it — at any width, with no
override, and before a seat, a queue place or a two-to-four minute
cluster rebuild is spent on it. Touch-only is
`(any-pointer: coarse) and (not (any-pointer: fine))` and is checked
before width, not after: a tablet in landscape is 1024 CSS px and has no
more keyboard than a phone, and rotating it does not grow one. A desktop
window merely dragged narrow — or zoomed to 400%, which reports the same
width — keeps the "Continue anyway" escape, because WCAG 1.4.10 makes
320 CSS px equivalent to 1280px at 400% zoom and a width test would lock
out the people who depend on that zoom.

The rule lives on the server, in both Go services, and the client
declares its own pointer type on every request (`X-Sim-Pointer`, from
`lib/deviceCapability.ts`). That inversion of the `examMode` pattern —
where the server owns a predicate and the client renders it — has one
cause: no server can measure a pointer, and a User-Agent is a string the
browser chooses. An absent header admits, because `./sim`,
`tests/smoke.sh` and every curl POST send none; like the session-state
gates, this is UX fidelity rather than security.

Nothing that would be refused is offered. The hosted lobby's hands-on
cards and the catalog's hands-on rows lose their buttons and say why, and
the mode screen returns the explanation instead of three cards nobody may
press — the "don't draw a control for something the product cannot do"
rule, applied to a fact about the device rather than about the product.

**The build.** Everything else is the multiple-choice engine and the
screens around it, and five rules carry it.

| Rule | Statement |
|---|---|
| Thumb Zone | a control reached for WITHOUT looking takes `--tap-comfortable` (48px) and sits at the bottom of the viewport; a control aimed at takes `--tap-min` (44px) and may sit anywhere. The mcq action bar is the first kind; an icon in a header row is the second |
| Safe Area | `index.html` opts into `viewport-fit=cover`, so the page reaches the notch and the home indicator and owes them padding in return. Every surface that touches an edge pays `--safe-b` (or `-t`/`-l`/`-r`); a fixed bar pays it itself, and a scrolled page pays it once on `.page` |
| Sheet | anything that would be a popover anchored to a corner becomes a panel rising from the bottom edge. One primitive — `Dialog`'s `sheet` variant — so focus management has one implementation. The navigator is the exception that proves it: it is a plain disclosure on a desktop and a modal sheet on a phone, because what it covers differs |
| Move, Don't Hide | a control that collapses is re-rendered in its new place, never drawn twice with one copy `display: none`. Two spans in one button both reach its accessible name, and a screen reader is offered "Navigator, question 7 of 65, Navigator" with no way to tell which is drawn |
| Press | touch feedback is a fill step, the same one hover uses. No scale, no spring, no shadow — and no haptics: iOS Safari exposes no Vibration API, and the `<input type="checkbox" switch>` workaround was patched in iOS 26.5 |

**The one departure from the rules above.** The navigator is documented
under Navigation as having no scrim, no `role="dialog"` and no focus
trap, because dimming a live remote desktop to pick question 12 would
read as a fault. On a phone, in the mcq engine, it takes all three. The
stated reason is about the remote desktop, and there is none behind an
mcq question; what is behind it there is the whole viewport, which is
what a focus trap exists for. `useFocusTrap` takes an `enabled` flag for
this rather than the component being forked.

**What jsdom cannot see.** The suite has no CSS engine and no layout, so
nothing above is proven by a render test. `styles/layout.test.ts` reads
the stylesheet as text and pins the declarations that are load-bearing —
including that every class the mobile overrides name is really put on an
element, which caught three dead selectors on the day it was written. The
rest is a browser pass at 320 / 390px in both themes, and it is not
optional: the reflow bug in the Reflow Floor rule above had been shipping
for the whole life of the exam catalog and no test could see it.

## Elevation and depth

Tone first, shadow only for what floats. Three surface tones separated by
1px hairlines carry depth, so the system is flat at the page level, and
shadow is tinted to the page rather than pure black. Dark keeps the same
three roles with black at 0.30–0.55 alpha.

| Token | Sites |
|---|---|
| `--shadow-1` | `.score-banner`, `.exam-card` — what lifts a card whose edge is only structural |
| `--shadow-2` | `.boot-panel`, `.toast`, `.desktop-required-card`, `.job-chip` |
| `--shadow-3` | `.confirm-dialog`, `.control-dialog`, `.info-drawer`, `.clipboard-panel` / `.keyboard-popover`, and `.question-panel` once it becomes an overlay under 900px |
| `--shadow-accent` | the single recommended card on a screen of choices. Tinting a shadow says "this one", which is why there is exactly one |
| `--shadow-machine` | windows drawn inside the VNC canvas. Black rather than ink-tinted, because they float over a machine and not over the page |

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
| `--radius-xs` | 4px | inline `code`, which is also every click-to-copy value, and small status pills. A box sized to a few characters needs a corner proportional to itself; nothing with real height takes it |
| `--radius-s` | 6px | anchored things: buttons, inset panels, code blocks, question rows and tiles, the timer chip, toasts, clipboard fields |
| `--radius-m` | 8px | grouped containers: option rows, inset panels, machine surfaces, the navigator popover |
| `--radius-l` | 10px | floating things: `.draw-panel`, the exam avatar, `.confirm-dialog`, `.control-dialog`, `.boot-panel`, `.desktop-required-card`, `.score-banner`, `.clipboard-panel` / `.keyboard-popover` |
| `--radius-xl` | 12px | the largest cards — exam cards and mode cards, which are big enough that 10px reads as square |
| `--radius-pill` | 999px | status objects read rather than pressed: `.question-points`, `.instance-chip`, `.mode-chip`, `.domain-bar`, `.pending-bar`, `.job-chip-bar`, plus `.info-button` (28×28, so genuinely circular) and `.theme-toggle` (pill radius on `0.25em 0.9em` of padding, so a lozenge) |

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
| Exam badge | `--text-2xs` mono uppercase at `--tracking-label`, `--radius-xs`, on a fill of its own: `--success-soft`/`--success-strong` for LIVE, `--muted-soft`/`--text-muted` for SOON. A live and a coming-soon card must be told apart by a word, never only by a hue |
| Points counter | mono, muted ink, hairline on the page fill, pill. Goes accent when its row is selected |
| Mode chip | the topbar's name for any attempt that is not a plain exam, so a training result is never mistaken for a real one |
| Card fill | `--surface` for cards that float, `--bg` for panels inset *within* a card — an inversion that reads correctly because the page tone is darker than the card in light and lighter in dark |
| Card padding | `--space-5` on exam and mode cards, `--space-5` on dialogs and the drawer, `--space-3`/`--space-4` on dense containers; page gutters close a step below 600px |
| Exam card | `--surface` under a `--border` hairline at `--radius-xl` with `--shadow-1`. A card is not a control, so its edge is structural and takes the weaker tier; what lifts it is the shadow. A coming-soon card drops the shadow, dashes the border and sits on `--bg` |
| Exam description | `.exam-desc` — the bank's one-line pitch at `--text-s`, three-line clamped, visible on the card rather than hidden in a `title=` tooltip touch devices never see. It occupies the slot the attempt-history bar will take |
| Mode card | one column of three, `--radius-xl`, with an edge-to-edge start button as its footer (the card's `overflow: hidden` supplies the corners, so the button never has to know the radius). The recommended card takes a 2px accent edge, `--shadow-accent` **and** the word "Recommended" — two of the three are colour, and colour alone is one channel |
| The Legible Refusal | an unavailable exam is not a disabled control but a refusal with a reason, and the reason is the point of rendering it. `--text-secondary` for the title, `--text-muted` for the reason, and unavailability marked by a dashed edge, a SOON badge and the absence of any action — never by opacity, and never by dimming the reason below the AA floor |

### Form controls

Four exist, and only three of them are visible. The candidate's real
input surface is the terminal, so the browser UI only starts, ends,
navigates and reports; a new screen reaching for a field is probably
solving the wrong problem. (There used to be another: the lobby's mode
radio group. Choosing a mode is now three cards each carrying its own
start button, so there is no selection to hold and then commit — the
choice and the act are one press.) The visible ones borrow the anchored
idioms — 6px corners, a hairline border, a `--surface-raised` fill, the
global focus ring — and the next would too.

| Control | Site | Treatment |
|---|---|---|
| Textarea | clipboard panel, `components/ClipboardPanel.tsx:87` | `.clipboard-input` — mono at `--text-s`, `--surface-raised` fill, `--border` hairline, 6px, `resize: vertical` |
| Checkbox ×2 | keyboard settings, `components/KeyboardSettings.tsx:49` and `:60` | native and unstyled, in a `.keyboard-row` flex row beside a `--text-s` label. The second is `disabled` while the first is off |
| File input | progress dashboard, `screens/Progress.tsx` | **Never drawn.** Held in the `.sr-only` clip and opened by an ordinary button, because a file picker is the only way a browser can hand a document back and importing a history export needs one. It is the mechanism; the button is the control. Counted here so the next reader knows it exists, not as licence for a visible one |

### Icons

Fourteen hand-authored SVGs in `ui/src/components/Icon.tsx` on a 24 grid,
`fill: none`, `stroke: currentColor`, stroke-width 1.75, round caps and
joins — the conventions `ui/public/favicon.svg` was already drawn with:
`chevron-left`, `chevron-right`, `chevron-down`, `check`, `cross`,
`flag`, `flag-filled`, `grid`, `copy`, `keyboard`, `theme-auto`,
`theme-light`, `theme-dark`, `help`.

Sized on `1em`, so an icon rides the type it sits in, and `currentColor`
throughout, so both themes and every state colour come free. Always
`aria-hidden` by construction: `Icon` takes no label prop, which is what
stops a later call site from making an icon load-bearing.

**The Arrow Vocabulary.** Two roles, one shape family. (A third pair,
`panel-collapse`/`panel-expand`, was deleted with the panel-collapse
control itself: the panel has no collapsed state to toggle into.)

| Meaning | Icon | Rotates |
|---|---|---|
| Step to a sibling (previous / next question) | `chevron-left` / `chevron-right` | no |
| Expand or collapse a disclosure in place | `chevron-down` | 180° on open |

The rotating chevron is load-bearing: it lets an expanded disclosure drop
the accent border that was byte-identical to the current question tile's.

### Navigation

There is no site nav. What stands in for it:

| Element | Treatment |
|---|---|
| Topbar (exam only) | `--surface` under a hairline bottom border, wrapping rather than compressing, title flexing from an 8rem basis and ellipsing |
| Task pane header | `TASK n / m` zero-padded to the total's width, the flag pill, an `h2` title, then a wrapping chip row: domain, weight share, target time, instance. It carries no navigation — the header used to hold prev/next steppers as well as the footer, and two sets of the same control on one pane is one too many. Weight is rendered as a *share* because `spec.questions[].weight` is a point budget, not a percentage: it sums to 180 in `ckad-mock-01` |
| Task pane footer | `← Previous` / `⊞ All tasks (G)` / `Next →`, the pane's only navigation. Minimum 44px for a coarse pointer |
| Navigator | one component (`.navigator`) for both engines, a full-panel disclosure in three bands: filter chips (`All` / flagged / unseen-or-unanswered), a flat ten-column grid of mono tiles, and a foot naming the four states and the keys. Ten to a row only pays off if row two starts at eleven, so the grid is sequential and the domain travels in each tile's accessible name rather than as a visual grouping. Five columns below a 320px container and for a coarse pointer. Its vocabulary is a prop, not a fork: hands-on says opened/unseen, mcq says answered/unanswered, because `marksStore` may not call a viewed question attempted. No scrim, no `role="dialog"`, no focus trap: dimming a live remote desktop to pick question 12 would read as a fault |
| App header | `.app-header`, 56px, on every screen that is a PAGE and deliberately not on the exam (which has a topbar carrying a clock and a submit button) or the boot screen. Two variants of one component: `brand` leads with the mark and wordmark, `back` replaces both with a labelled way out for a screen reached FROM another. `flex-shrink: 0` is load-bearing — as a flex item its `height` is only a base size, and a tall page squashed it to its min-content height |
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

### The exam and mode selectors

Two steps before a session exists, and the only two screens addressed by
a URL fragment (`#/exams`, `#/exams/<id>/mode`). `session.state` is
still the outer switch — it is server truth and no bookmark may
contradict it — and the route only chooses between views inside one
state.

| Element | Treatment |
|---|---|
| `.page` | the shared root of both: `min-height: 100%`, centred at `--page-max`, and it scrolls the *document* rather than a box of its own. A nested scrollbar under a 56px fixed header is the failure the score screen has its own override to avoid |
| Progress capsule | how far along the path you are — certifications passed over certifications on it, as a figure plus one segment per card in the grid below. It used to count what was *playable* and double as the grid's engine legend, because nothing recorded an attempt; the segments now carry pass state instead, so they are no longer a key to the card hues. The bar is `aria-hidden`: the figure beside it already says the same thing in words, and empty list items announce as nothing at all |
| Exam grid | `auto-fit` from a 330px minimum for live exams, 240px for coming-soon ones. Two columns at `--page-max` today because there are two live exams, not because two is specified |
| Stat strip | four cells between two hairlines: duration, draw, passing score, engine. A `<dl>` with `dt` before `dd` as the grammar requires, drawn figure-above-label by `column-reverse` — a visual order only, so a screen reader still hears "Duration, 2h" |
| The pool pair | "65 / 97" appears only when the two numbers differ. A card reading "22 / 22" would advertise a random draw that bank does not do |
| Mode capability rows | one row per server-enforced permission, generated from the `helpAllowed` / `gradesPerTask` / `recorded` flags on `GET /api/exam` — never restated client-side, so a card cannot advertise something the server then refuses. The tick and cross are decoration; an `.sr-only` "Yes:"/"No:" carries the state |
| Draw panel | what the exam will ask, as tags rather than chips. Nothing filters anything yet, so nothing wears a control's border, hover or cursor — a chip that looks clickable and is not is worse than a plain tag |

**Choosing an exam is not a navigation.** Only one bank is loaded at a
time, because a bank is a Kubernetes cluster seeded for its questions,
so picking any other one is a 2–4 minute destructive rebuild. Every card
carries the same verb; a card that is not the active bank goes through a
confirmation first, and the mode screen it was meant to reach opens by
itself once the rebuild lands.

### The MCQ exam surface

`screens/McqExam.tsx`: a single centred `--mcq-measure` reading column
under the same topbar, no desktop pane, with a 5px determinate rail
directly beneath the topbar. Its head row is its own (`.mcq-head`) rather
than the hands-on pane's classes — the two engines diverged when the task
pane grew a chip row and a footer nav, and sharing a header past that
point meant each change had to be safe for both. What they still share is
the `Navigator`. The domain rides the head row as a chip, the one
per-question fact an mcq candidate can use. Positions
(`Q7`) are the only question identity the candidate ever sees — the
bank's pool ids are an artifact of the random draw and never render,
including in the submit dialog's unanswered list and the practice
dialog.

| Element | Treatment |
|---|---|
| `.mcq-option` | an anchored control: `--surface-raised` fill on `--border`, 6px corners, 44px minimum touch target. Hover steps the fill to `--raised-hover` and never moves the edge |
| `.mcq-option-on` | the full three-channel selection: accent edge, `--accent-soft` wash, 3px inset bar — plus the visible native checkbox as the non-visual channel. The option letter goes `--accent-strong` on the wash |
| `.mcq-footer` | Previous / the save reassurance / Navigator + Next, with the final question's Next giving way to the one primary button. The tally that used to sit here moved to the topbar: the footer's job is moving and reassuring, and a completion count competing with the head row's position was two numbers both claiming to locate the candidate |
| `.mcq-option-letter` | a 24px circle carrying A–F, filling accent when selected. Scoped under `.mcq-question` so the score screen's answer review keeps the flat letter it already had |
| Answered tile | the navigator's `is-done` tile under `progress="answered"`: `--surface-raised` behind the strong hairline, plus "answered" in the accessible name — server state, not a rendering guess, because mcq answers are saved per click |

### Result and teaching components

| Component | Treatment |
|---|---|
| `CheckList` | per-check rows for a graded question: mark, description, `earned/points`, message, under an `.sr-only` header row. Three outcomes: `--success` check, `--danger` cross, and a muted `·` for a check that never ran (a malformed points header in the bank), whose message says so in italics rather than posing as a failure |
| `DomainBreakdown` | the score page's per-domain table, weakest first, each row carrying a pill-radius bar (`.domain-bar`) whose width is the one data-driven inline style on the page |
| `McqAnswerReview` | the mcq score review: every option re-rendered with icon-plus-words state (`correct, and you selected it` family), never colour alone; solid `--success` edge for correct-selected, dashed for correct-missed, `--danger` for wrong-selected |
| `HintTray` | training's two-tier hints and solution reveal, a `details` disclosure family keyed by question id so a revealed hint never travels to the next question |
| `Toast` | two fixed-position live regions — polite for info (5s TTL), assertive for warnings (which persist and carry a `!` mark as the non-colour channel) — above every overlay, so a confirmation is never rendered invisible |
| `ExamIntro` | the how-this-works card: a self-contained `role="img"` schematic with numbered 50% circles and a prose legend, deliberately not an overlay tour measured against live layout |
| `.control-log-pane` | the rebuild dialog's build log: retained command output in mono `--text-xs` on `--surface-raised`, scrolling inside its own 12rem box (Scroll-Inside), following the newest line unless the reader scrolls up |
| `Explain` | the per-task deep dive, opened from a verdict row, and **the only place the reference solution is rendered**. Its centrepiece is two `--machine-*` document panes side by side — the one place machine surfaces appear outside the VNC canvas, because what they show is the cluster and not the app. Changed lines carry an ASCII `-`/`+` gutter as well as a `--diff-*` wash, so the comparison survives greyscale, and a legend above the first comparison names the glyphs rather than assuming diff literacy — once per section, because a key read after the thing it decodes has been read too late. Several checks can each capture something (a Service and an EndpointSlice are not one comparison), so they group as articles under one heading rather than stacking as rival sections. Below 1100px the panes stack in reading order, each keeping the title that says which it is. The solution section is the destination: its prose is capped at a reading measure while its listings and tables keep the full card, because a `kubectl` line and a paragraph do not want the same width. Some tasks have no captured documents at all — evidence is emitted only by checks that ask for it — so the screen must also be good as checks, a failure message and the solution, and it is |
| `.weak-rows` | the dashboard's weakest-domain ranking, capped at six. The bars are `--accent`, not `--danger`: the panel ranks a candidate's domains against *each other*, and reddening 92% because it sorted last would say something untrue. The heading and the order carry "weakest" |
| `.path-card` | one certification's standing: acronym, status word, best score, bar, meta line. The word is the channel and the card's tint is the second signal — a passed card and an untouched one must never differ by hue alone |

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
- **Do** use the `-strong` tier for TEXT in any hue that also draws a
  graphic — `--success-strong`, `--warn-strong`, `--progress-strong`. The
  base tokens are measured to 3:1 for bars and icons, not to 4.5:1 for
  labels. `--accent` needs no such substitution any more: it clears 4.5:1
  on every fill in the product, which retired the old rule.
- **Do** reach for tone and a 1px hairline first, and add a shadow only when
  the element genuinely floats above the page.
- **Do** set anything the candidate must type, match, or read as a
  measurement in IBM Plex Mono, with `tabular-nums` if it changes over
  time.
- **Do** pick radii from the six that exist: 4px inline chips only, 6px
  anchored, 8px grouped containers, 10px floating, 12px the largest
  cards, pill for status.
- **Do** write new motion additively inside `prefers-reduced-motion:
  no-preference`, animating only `transform` and `opacity`.
- **Do** change all three mirrors when a colour changes — the Go locked
  page, the favicon, and the terminal palette with its xfconf twin.
- **Do** make wide content scroll inside its own container, and keep pinned
  whatever the user is waiting on.
- **Do** pay the safe-area inset on anything that reaches a viewport edge.
  `viewport-fit=cover` is on, so those edges are the physical edges of the
  device: a fixed bar pays `--safe-b` itself, and a scrolled page pays it
  once on `.page`.
- **Do** check a mobile change in a browser at 320 and 390px before
  calling it done. jsdom has no layout engine, so the suite cannot see a
  wrapped row, a clipped button or a page that scrolls sideways — the
  reflow bug in the Don't below had been shipping for the whole life of
  the exam catalog.
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
- **Don't** let the score page or the selector screens drift toward a dashboard — dense
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
  interaction belongs in the terminal. Four exist, one of them never
  drawn, and each earned its place.
- **Don't** reach for a dropdown, select or menu. The navigator is this
  product's disclosure pattern and already carries more per option than a
  native select can render — four states each on two channels, live
  filter counts, and the domain and points in every tile's accessible
  name.
- **Don't** write a bare length as an `auto-fit` grid minimum. `minmax(330px,
  1fr)` builds a 330px track inside a 305px viewport and scrolls the page
  sideways at the 320px reflow width. Use `minmax(min(330px, 100%), 1fr)`.
- **Don't** collapse a control by rendering it twice and hiding one copy.
  Both copies reach the accessible name, and a screen reader is offered
  each of them with no way to tell which is drawn. Branch in the
  component.
- **Don't** key a hover style to `any-pointer: coarse` or a touch target
  to `hover: none`. One asks whether a finger could be used and governs
  size; the other asks whether a pointer can rest without pressing and
  governs state. A touchscreen laptop answers them differently.
- **Don't** convey a control's state with `opacity`. It dims the border and
  the focus ring along with the label, and composites to a ratio nobody
  measured. Use `--text-disabled`.
- **Don't** draw a control for something the product cannot yet do. Say it
  in prose instead and let the control arrive with the capability. A
  control that looks live and does nothing is worse than no control,
  because the candidate spends their trust before they find out.

  Three places took prose under this rule, and all three have since become
  controls — the mode screen's domain summary once the draw was
  configurable, the results screen's "drill your weak domains" card once
  something sent `StartOptions.domains`, and its task rows once the
  explanation screen existed. That is the rule working rather than
  expiring: each waited for its capability and arrived with it, and none
  of them shipped a period of looking live and doing nothing. Keep the
  rule; the examples are its record, not its scope.

## Enforcement

Four parts of this document are now enforced, and they are the ones that
went stale fastest when they were not:

| Check | What it holds |
|---|---|
| `ui/src/styles/contrast.test.ts` | re-derives every contrast ratio from the shipped `tokens.css` and fails the build on a pairing under its floor. Also asserts that the `prefers-color-scheme` twin matches the explicit dark block declaration for declaration, and that every colour token has a dark value |
| `ui/src/styles/mirrors.test.ts` | holds the Three Mirrors rule: the terminal palette, the Go locked page and the favicon must carry the token values they mirror |
| `ui/src/styles/layout.test.ts` | holds the load-bearing layout declarations, including the `.desktop-canvas` rules that stop noVNC's `ResizeObserver` feeding back, the height chain's `100%`-before-`100dvh` ordering, and the deep dive's no-truncation sweep — a task title may wrap but must never be clipped, which no jsdom render can see |
| `ui/src/styles/layout.test.ts`, the touch-layer sweep | holds that every class the mobile overrides name is really put on an element by a component. These rules restyle components defined hundreds of lines above them, and a renamed or mistyped class produces no error, no warning and no visible change on any machine a developer is likely to be using — it simply does nothing, on phones, forever. It caught three the day it was written. It also holds that `touch-action: none` appears on `.panel-resizer` and nowhere else, because that value takes pinch zoom with it (WCAG 1.4.4) |

Everything else here is convention: the prose, the component tables, the
named rules. Where this document disagrees with
`ui/src/styles/tokens.css` or `ui/src/theme.css`, the CSS is right.

The frontmatter is a machine-readable export of the token system and is
consumed as a tooling contract. It carries light values only, and it is
the target system rather than a survey of current call sites — screens
still mid-migration to the new scale will disagree with it in places.
