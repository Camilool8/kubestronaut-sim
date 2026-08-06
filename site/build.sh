#!/usr/bin/env sh

set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo=$(dirname "$here")

TOKENS_SRC="$repo/ui/src/styles/tokens.css"
FAVICON_SRC="$repo/ui/public/favicon.svg"
FONT_SRC="$repo/ui/node_modules/@fontsource"

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

  sed -n '/<svg/,$p' "$FAVICON_SRC" > "$out/favicon.svg"

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
    for name, pool, _ in banks:
        if str(pool) not in block:
            fail.append(f"{name} has {pool} questions, absent from the stat note")

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
