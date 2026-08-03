#!/usr/bin/env sh
# Generates the parts of site/ that are copies of files owned elsewhere.
#
# The landing page is plain HTML and CSS with no bundler, but it must not
# hold a second copy of the design system. Three files here are OWNED
# somewhere else in this repository and only mirrored into site/ so that
# the directory can be served on its own:
#
#   ui/src/styles/tokens.css  ->  site/tokens.css
#   ui/public/favicon.svg     ->  site/favicon.svg
#   @fontsource latin subsets ->  site/fonts/*.woff2
#
# A mirror is only safe when something holds it equal to its source, which
# is the same bargain the product already makes for the terminal palette,
# the Go locked page and the favicon (the Three Mirrors rule in DESIGN.md,
# enforced by ui/src/styles/mirrors.test.ts). `build.sh --check` is this
# directory's version of that test: it regenerates into a temporary tree
# and fails on any difference, so a token change that has not reached the
# landing page is a failure rather than a slow drift.
#
#   ./site/build.sh            regenerate
#   ./site/build.sh --check    fail if a generated file is out of date
#
# Run from anywhere; paths resolve against this script.

set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo=$(dirname "$here")

TOKENS_SRC="$repo/ui/src/styles/tokens.css"
FAVICON_SRC="$repo/ui/public/favicon.svg"
FONT_SRC="$repo/ui/node_modules/@fontsource"

# Only the latin subsets, and only the two weights the page sets. The app
# loads five faces; this page is 400 and 600 in each family and nothing
# else, so vendoring the rest would be 700KB of unreferenced payload.
FONT_FILES="ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2
ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2
ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2
ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2"

banner() {
  cat <<EOF
/* GENERATED FILE - DO NOT EDIT.
   Verbatim copy of $1, written by site/build.sh.
   Edit the source and re-run the script; \`site/build.sh --check\` fails
   the moment these two disagree. */

EOF
}

generate() {
  out=$1

  [ -f "$TOKENS_SRC" ] || { echo "build.sh: missing $TOKENS_SRC" >&2; exit 1; }
  [ -f "$FAVICON_SRC" ] || { echo "build.sh: missing $FAVICON_SRC" >&2; exit 1; }

  mkdir -p "$out/fonts"
  { banner "ui/src/styles/tokens.css"; cat "$TOKENS_SRC"; } > "$out/tokens.css"

  # The favicon is copied from its opening <svg tag onward, dropping the
  # leading comment. That comment is not noise, but it names design tokens
  # -- and a double hyphen is forbidden inside an XML comment, so the file
  # as authored is not well-formed XML. A favicon survives that; an <img>
  # source does not, and this page draws the mark in its header. Stripping
  # is deterministic from the source, so --check still holds the two equal.
  # The real fix belongs in ui/public/favicon.svg, which is outside this
  # directory's remit.
  sed -n '/<svg/,$p' "$FAVICON_SRC" > "$out/favicon.svg"

  # Fonts are optional: without them the page falls through the token
  # stacks to system-ui / ui-monospace, which is a different look but a
  # working page. They need `npm ci` to have run in ui/.
  if [ -d "$FONT_SRC" ]; then
    for f in $FONT_FILES; do
      cp "$FONT_SRC/$f" "$out/fonts/$(basename "$f")"
    done
  else
    echo "build.sh: $FONT_SRC not found - skipping fonts." >&2
    echo "          Run 'npm ci' in ui/ to vendor IBM Plex; until then the" >&2
    echo "          page renders in the token stacks' system fallbacks." >&2
  fi
}

# The figures on the page, against the banks they describe.
#
# The three mirrored files above are held equal by regenerating them, but
# index.html is written by hand and nothing regenerates it -- so the
# numbers it advertises could only ever drift. They have: a whole wave
# shipped attempt history while the page still told the world there was
# none, and this gate's own CI comment claimed to be catching exactly
# that. It was not. A claim the build does not hold up does not ship
# (PRODUCT.md, principle 3), and that applies to the build's claims too.
#
# Which banks count is the product's own answer, not a list kept here:
# `hidden: true` is what keeps the smoke fixtures out of the exam
# selector, and it keeps them out of the advertised total for the same
# reason. exam.yaml is machine-shaped and simple, so it is parsed with
# regexes -- the same bargain tests/bank-weights.sh takes, and the reason
# neither needs yq on the host running it.
check_figures() {
  python3 - "$repo" <<'PY'
import pathlib, re, sys

repo = pathlib.Path(sys.argv[1])
page = (repo / "site" / "index.html").read_text()

banks = []
for path in sorted((repo / "banks").glob("*/exam.yaml")):
    text = path.read_text()
    head, _, spec = text.partition("\nspec:")
    if re.search(r"^\s*hidden:\s*true\s*$", head, re.M):
        continue
    pool = len(re.findall(r"^\s*-\s+id:\s*\S+", spec, re.M))
    drawn = re.search(r"^\s*examLength:\s*(\d+)\s*$", spec, re.M)
    banks.append((path.parent.name, pool, int(drawn.group(1)) if drawn else None))

fail = []
if not banks:
    fail.append("found no listable bank under banks/ -- the parse is wrong")

# The headline total, matched through its label rather than its position:
# there are three .stat-figure elements and only one of them counts
# questions.
total = sum(pool for _, pool, _ in banks)
block = next(
    (b for b in re.findall(r'<li class="stat">.*?</li>', page, re.S)
     if "Questions written" in b),
    None,
)
if block is None:
    fail.append('no <li class="stat"> block labelled "Questions written"')
else:
    shown = re.search(r'<p class="stat-figure">\s*(\d+)', block)
    if shown is None:
        fail.append("the questions stat has no figure")
    elif int(shown.group(1)) != total:
        fail.append(f"questions stat says {shown.group(1)}, banks hold {total}")
    # The note breaks the total down per bank, so every part must be real
    # too -- a right total made of two wrong halves is still a wrong page.
    for name, pool, _ in banks:
        if str(pool) not in block:
            fail.append(f"{name} has {pool} questions, absent from the stat note")

# A pooled bank advertises "drawn / pool". Page-wide containment rather
# than a pinned selector: this pair is drawn on the exam card and the
# prose beneath it, and pinning one spelling of the markup would make
# every re-layout a false failure.
for name, pool, drawn in banks:
    if drawn is None:
        continue
    if not re.search(rf"\b{drawn}\b.*?\b{pool}\b", page, re.S):
        fail.append(f"{name} draws {drawn} of {pool}, not advertised as such")

for line in fail:
    print(f"build.sh: {line}", file=sys.stderr)
sys.exit(1 if fail else 0)
PY
}

# The link-preview card, against the page that advertises it.
#
# og.png is NOT a mirror and cannot be one here: it is a raster, and
# regenerating it needs a browser, which is exactly the dependency this
# directory refuses to take. So this holds the parts that CAN be held --
# that the source and the artwork both exist, that the artwork is the
# frame Open Graph expects, and that index.html advertises the frame the
# file actually has. A card whose declared size is a lie gets cropped or
# dropped by the scraper, and nobody finds out from the repository.
#
# What it deliberately does NOT check: whether the pixels are current.
# Editing og.html without re-running the command in site/README.md leaves
# a stale card and this gate green. Said plainly rather than implied,
# because a check that is trusted for more than it does is worse than no
# check -- which this file has already learned once (see check_figures).
#
# PNG dimensions come from the IHDR header: an 8-byte signature, a 4-byte
# chunk length, the "IHDR" tag, then width and height as big-endian
# uint32. That is a fixed offset in every PNG ever written, so it needs
# no image library on the host.
check_og() {
  python3 - "$repo" <<'PY'
import pathlib, re, struct, sys

repo = pathlib.Path(sys.argv[1])
fail = []

src = repo / "site" / "og.html"
png = repo / "site" / "og.png"
if not src.exists():
    fail.append("site/og.html is missing -- og.png has no source to be rebuilt from")

want = (1200, 630)
if not png.exists():
    fail.append("site/og.png is missing, but index.html points og:image at it")
else:
    head = png.read_bytes()[:24]
    if head[:8] != b"\x89PNG\r\n\x1a\n" or head[12:16] != b"IHDR":
        fail.append("site/og.png is not a PNG")
    else:
        got = struct.unpack(">II", head[16:24])
        if got != want:
            fail.append(f"site/og.png is {got[0]}x{got[1]}, want {want[0]}x{want[1]}")

page = (repo / "site" / "index.html").read_text()
for prop, value in (("og:image:width", want[0]), ("og:image:height", want[1])):
    m = re.search(rf'property="{prop}"\s+content="(\d+)"', page)
    if m is None:
        fail.append(f"index.html declares no {prop}")
    elif int(m.group(1)) != value:
        fail.append(f"index.html says {prop} is {m.group(1)}, the file is {value}")

# Relative og:image and og:url are ignored by every scraper, which is a
# silent failure: the page looks fine and the preview is simply blank.
for prop in ("og:image", "og:url"):
    m = re.search(rf'property="{prop}"\s+content="([^"]+)"', page)
    if m is None:
        fail.append(f"index.html declares no {prop}")
    elif not m.group(1).startswith("https://"):
        fail.append(f"{prop} is not absolute: {m.group(1)}")

for line in fail:
    print(f"build.sh: {line}", file=sys.stderr)
sys.exit(1 if fail else 0)
PY
}

# The certification marks, against the component that owns them.
#
# ui/src/components/CertMark.tsx draws one mark per certification and the
# app renders it from there. This page cannot import a React component,
# so the same geometry is inlined into index.html -- a fourth mirror, and
# mirrors held equal only by convention drift the moment nobody re-greps
# (the lesson ui/src/styles/mirrors.test.ts was written for).
#
# Rather than regenerate, this compares: every <svg class="cert-mark">
# carries data-cert, and its shapes must match that certification's entry
# in the component exactly -- same elements, same attributes, same
# values. Attribute ORDER and whitespace are normalised away, because JSX
# self-closes with a space and the page does not, and neither difference
# changes a single pixel.
#
# The set must match both ways. A mark added to the component and not the
# page is a landing page advertising four exams out of five; a mark on
# the page with no component behind it is art the app cannot render.
check_cert_marks() {
  python3 - "$repo" <<'PY'
import pathlib, re, sys

repo = pathlib.Path(sys.argv[1])
tsx = (repo / "ui" / "src" / "components" / "CertMark.tsx").read_text()
page = (repo / "site" / "index.html").read_text()
fail = []

def shapes(fragment):
    """Every drawn element, as (tag, sorted attribute pairs)."""
    out = []
    for tag, attrs in re.findall(r"<(circle|path|rect)\b([^>]*?)/?>", fragment):
        pairs = tuple(sorted(re.findall(r'([\w-]+)\s*=\s*"([^"]*)"', attrs)))
        out.append((tag, pairs))
    return out

# The component's MARKS record: KEY: ( ...jsx... ),
body = re.search(r"const MARKS[^{]*\{(.*?)\n\};", tsx, re.S)
if body is None:
    fail.append("could not find the MARKS record in CertMark.tsx")
    component = {}
else:
    component = {
        cert: shapes(frag)
        for cert, frag in re.findall(r"\n  (\w+):\s*\(\s*(.*?)\s*\),", body.group(1), re.S)
    }

published = {
    cert: shapes(frag)
    for cert, frag in re.findall(
        r'<svg class="cert-mark" data-cert="(\w+)"(.*?)</svg>', page, re.S
    )
}

if not component:
    fail.append("CertMark.tsx defines no marks -- the parse is wrong")
if not published:
    fail.append("index.html carries no cert-mark svg -- the parse is wrong")

for cert in sorted(set(component) - set(published)):
    fail.append(f"{cert} has a mark in CertMark.tsx but none on the landing page")
for cert in sorted(set(published) - set(component)):
    fail.append(f"{cert} is drawn on the landing page but not in CertMark.tsx")

for cert in sorted(set(component) & set(published)):
    if component[cert] != published[cert]:
        fail.append(
            f"{cert}'s mark differs between CertMark.tsx and index.html "
            f"-- re-copy the geometry"
        )

for line in fail:
    print(f"build.sh: {line}", file=sys.stderr)
sys.exit(1 if fail else 0)
PY
}

if [ "${1:-}" = "--check" ]; then
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  generate "$tmp"

  status=0
  check_figures || status=1
  check_og || status=1
  check_cert_marks || status=1
  for f in tokens.css favicon.svg; do
    if ! diff -q "$tmp/$f" "$here/$f" >/dev/null 2>&1; then
      echo "build.sh: site/$f is out of date - run site/build.sh" >&2
      status=1
    fi
  done
  # Only compared when the source exists; see the note in generate().
  if [ -d "$FONT_SRC" ]; then
    for f in $FONT_FILES; do
      name=$(basename "$f")
      if ! diff -q "$tmp/fonts/$name" "$here/fonts/$name" >/dev/null 2>&1; then
        echo "build.sh: site/fonts/$name is out of date - run site/build.sh" >&2
        status=1
      fi
    done
  fi

  [ "$status" -eq 0 ] && echo "build.sh: site/ is in sync with its sources."
  exit "$status"
fi

generate "$here"
echo "build.sh: wrote site/tokens.css, site/favicon.svg and site/fonts/."
