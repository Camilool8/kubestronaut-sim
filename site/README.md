# site/

The repository landing page. A standalone static page for GitHub Pages —
plain HTML and CSS, no build tooling, no network requests at runtime. It
is **not** part of the React app in `ui/` and shares no code with it.

There is exactly one script on the page, inline at the foot of
`index.html` and about ten lines long. All it does is pause the hero's
orbit animation while the hero is scrolled off screen, which CSS alone
cannot detect. Nothing on the page depends on it running: no script, no
`IntersectionObserver`, or a thrown error each leave the figure exactly
as the stylesheet drew it. Keep it that way — if a second script is ever
needed, that is the moment to ask whether this directory still wants to
be static.

## Preview

```bash
./site/build.sh                       # from the repo root
python3 -m http.server 8000 -d site   # then open http://localhost:8000
```

`build.sh` is not a bundler. It only copies the three things this
directory mirrors from elsewhere in the repo (below); the page is
otherwise served exactly as it is written.

## How it consumes the design system

`index.html` loads `tokens.css` before its own stylesheet:

```html
<link rel="stylesheet" href="tokens.css" />
<link rel="stylesheet" href="fonts.css" />
<link rel="stylesheet" href="styles.css" />
```

`site/tokens.css` is a **generated, verbatim copy** of
`ui/src/styles/tokens.css`. `site/styles.css` contains no literal colour,
size, radius, shadow or duration — every value is a `var()` into that
file. A landing page with its own hex values is a second source of truth
that diverges the first time a token changes.

The copy exists only because GitHub Pages serves a single directory and
cannot reach up into `ui/`. It is held equal to its source the same way
the rest of the product holds its mirrors equal (the Three Mirrors rule
in `DESIGN.md`, enforced by `ui/src/styles/mirrors.test.ts`):

```bash
./site/build.sh --check    # non-zero if a generated file is out of date
```

Run that alongside the other offline gates in `AGENTS.md`. A token change
that has not reached the landing page is then a failure, not a slow drift.

`--check` also verifies the link-preview card as far as it can, described
under "The link-preview card" below, and re-derives the page's **figures**
from `banks/*/exam.yaml`
and fails if they disagree: the headline question total, each bank's
share of it, and the drawn/pool pair of every pooled bank. `index.html`
is written by hand and nothing regenerates it, so its numbers could only
ever drift — and they had, for a whole wave, while a green CI step
claimed to be catching exactly that. Break a figure and watch the gate
fail before you trust it.

### Generated files — do not edit

| File | Source |
|---|---|
| `tokens.css` | `ui/src/styles/tokens.css` |
| `favicon.svg` | `ui/public/favicon.svg` |
| `fonts/*.woff2` | `ui/node_modules/@fontsource/ibm-plex-{sans,mono}` |

Fonts need `npm ci` to have run in `ui/`. Without them `build.sh` warns
and the page falls through the token stacks to `system-ui` and
`ui-monospace` — plainer, and fully functional.

## The link-preview card

`og.png` is the 1200×630 image every scraper shows when someone pastes a
link to the site. It is generated from `og.html`, which is a real page in
this directory: it loads `tokens.css` and `styles.css` and draws the hero
orbit with the *same rules the hero uses*, so the card cannot advertise a
design the site does not have. It sets `data-theme="dark"` on `<html>`,
because a raster cannot follow a preference and a dark card stays a
defined object on a light feed and on a dark one.

Regenerate it after any change to `og.html`, `styles.css` or the tokens:

```bash
python3 -m http.server 8099 -d site &                 # Chrome needs an origin for the fonts
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars --force-color-profile=srgb \
  --screenshot=site/og.png --window-size=1200,630 \
  http://localhost:8099/og.html
```

`--window-size` and the `.og` rule in `og.html` must agree, and both must
agree with the `og:image:width` / `og:image:height` in `index.html`.

**This is the one thing in this directory that is not held equal to its
source.** Rasterizing needs a browser, which is a dependency this
directory will not take, so `build.sh --check` cannot rebuild `og.png`
and compare. What it *does* check: that `og.html` and `og.png` both
exist, that the PNG really is 1200×630 (read straight out of the IHDR
header, no image library), and that `index.html` declares that same size
and gives absolute URLs for `og:image` and `og:url` — a relative one is
ignored by every scraper, and it fails silently, leaving a page that
looks fine and a preview that is blank.

So editing `og.html` and forgetting the command leaves a stale card and a
green gate. That is stated here rather than implied, because a check
trusted for more than it does is worse than no check — a lesson this
directory has already had once, from a CI step that claimed to catch a
question count drifting from the banks and did not.

Two things worth knowing when the artwork changes: scrapers cache
aggressively, so the platform's own cache has to be flushed before a new
card appears; and the URLs point at the GitHub Pages origin, so they
resolve only once Pages is serving this directory.

## Things worth knowing before editing

- **The quickstart terminal takes `--machine-*`, not dark-mode tokens.**
  It is literally a computer, and that family is a dark palette that
  appears in *both* themes. `--ink` (the "What this is not" band) is the
  opposite case: that is the product raising its voice, and it inverts to
  a raised surface in dark mode.
- **There is no theme toggle.** The page sets no `data-theme` attribute,
  so it follows `prefers-color-scheme` through the twin block in
  `tokens.css`.
- **The hero orbit is a data figure, not an illustration.** Five rings,
  one per certification on the Kubestronaut path; the two with a bank are
  solid with a filled body, the three without are dashed with a hollow
  one. Ring colour is `--exam-tint`, the same alias the exam cards use, so
  a ring and its card cannot disagree about an engine's hue — and
  `[data-engine="soon"]` is already the token system's answer for
  "advertised, not runnable". When a bank lands, its ring changes
  `data-state` and nothing else. State is on three channels (line style,
  body fill, and the caption naming which is which) so it never rests on
  hue alone.
- **A code chip must never end a sentence.** `code` carries horizontal
  padding, which pushes a following full stop a clear space away and
  leaves the punctuation looking detached. Word around it. Three places
  on the page used to get this wrong.
- **Every figure on the page is countable.** Question counts come from
  `spec.questions` in `banks/*/exam.yaml`, durations and passing scores
  from `spec`, and the coming-soon reasons verbatim from
  `banks/catalog.yaml`. If a bank changes, these numbers change. Nothing
  here may be rounded up or projected.
- **The non-affiliation notice is binding** on every surface that names a
  certification, and this page names all five. The wording in the footer
  is the app's own, from `ui/src/strings.ts` (`info.disclaimerBody`).
