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

check_shots() {
  python3 - "$repo" <<'PY'
import pathlib, re, struct, sys

repo = pathlib.Path(sys.argv[1])
fail = []


def webp_size(raw):
    """Intrinsic size of a WebP, for the three chunk layouts Pillow emits."""
    if raw[:4] != b"RIFF" or raw[8:12] != b"WEBP":
        return None
    tag = raw[12:16]
    if tag == b"VP8X":
        return (int.from_bytes(raw[24:27], "little") + 1,
                int.from_bytes(raw[27:30], "little") + 1)
    if tag == b"VP8 ":
        if raw[23:26] != b"\x9d\x01\x2a":
            return None
        w, h = struct.unpack("<HH", raw[26:30])
        return w & 0x3FFF, h & 0x3FFF
    if tag == b"VP8L":
        if raw[20] != 0x2F:
            return None
        n = int.from_bytes(raw[21:25], "little")
        return (n & 0x3FFF) + 1, ((n >> 14) & 0x3FFF) + 1
    return None


# Every <img> that points into shots/, with the size the page declares for it.
# README paths are repo-relative, the landing page's are site-relative.
pages = {
    "README.md": (repo / "README.md", "site/"),
    "site/index.html": (repo / "site" / "index.html", "site/"),
}

seen = {}
for label, (path, prefix) in pages.items():
    text = path.read_text()
    for kind, tag in re.findall(r"<(img|source)\b([^>]*)>", text):
        m = re.search(r'(?:src|srcset)="([^"]+)"', tag)
        if not m or "shots/" not in m.group(1):
            continue
        rel = m.group(1)
        rel = rel[len("site/"):] if rel.startswith("site/") else rel
        f = repo / "site" / rel
        w = re.search(r'width="(\d+)"', tag)
        h = re.search(r'height="(\d+)"', tag)
        seen.setdefault(f, []).append((label, kind, int(w.group(1)) if w else None,
                                       int(h.group(1)) if h else None))

# GitHub's markdown CSS is `img { max-width: 100% }` with no `height: auto`,
# and it strips inline style. So a height attribute is honoured literally while
# max-width shrinks the width, and every image in the README renders stretched.
# The height must be absent there; the landing page sets height:auto in its own
# stylesheet and wants both, which is what the loop below enforces per page.
for tag in re.findall(r"<img\b[^>]*>", (repo / "README.md").read_text()):
    src = re.search(r'src="([^"]+)"', tag)
    if src and re.search(r'height="\d+"', tag):
        fail.append(
            f"README.md sets a height on {src.group(1).split('/')[-1]} -- GitHub "
            f"honours it while max-width shrinks the width, so the image renders "
            f"stretched. Give it a width only."
        )

if not seen:
    fail.append("no shot is referenced by README.md or index.html -- the parse is wrong")

sizes = {}
for f, uses in sorted(seen.items()):
    where = ", ".join(sorted({u[0] for u in uses}))
    if not f.exists():
        fail.append(f"{f.relative_to(repo)} is referenced by {where} but does not exist")
        continue
    got = webp_size(f.read_bytes())
    if got is None:
        fail.append(f"{f.relative_to(repo)} is not a readable WebP")
        continue
    sizes[f.name] = got
    for label, kind, w, h in uses:
        # Only <img> reserves space. A <picture>'s <source> carries no
        # width/height by design; its size is checked against its twin below.
        if kind != "img":
            continue
        if w is None:
            fail.append(f"{label} embeds {f.name} without a width")
            continue
        # Captured at deviceScaleFactor 2, so the file is exactly twice the
        # size the page reserves for it. A re-capture at another viewport or
        # scale breaks this before it breaks the layout.
        if got[0] != w * 2:
            fail.append(f"{label} declares {f.name} as {w} wide (expects a {w*2}px file), got {got[0]}")
        if label.endswith(".html"):
            # The landing page styles these height:auto, so both attributes are
            # safe there and together they reserve the right box before load.
            if h is None:
                fail.append(f"{label} embeds {f.name} without a height -- it will shift the page as it loads")
            elif got[1] != h * 2:
                fail.append(f"{label} declares {f.name} as {w}x{h} (expects a {w*2}x{h*2} file), got {got[0]}x{got[1]}")

# A <picture> pair whose halves differ in size jumps when the theme changes.
for name, got in sorted(sizes.items()):
    if not name.endswith("-dark.webp"):
        continue
    twin = name.replace("-dark.webp", "-light.webp")
    if twin in sizes and sizes[twin] != got:
        fail.append(f"{name} is {got[0]}x{got[1]} but {twin} is {sizes[twin][0]}x{sizes[twin][1]} -- the theme swap would resize the page")

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
  check_shots || status=1
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
