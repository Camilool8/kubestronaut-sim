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

if [ "${1:-}" = "--check" ]; then
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  generate "$tmp"

  status=0
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
