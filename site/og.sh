#!/usr/bin/env sh
#
# Rebuilds site/og.png from site/og.html + site/og-orbit.svg. Run this
# after editing either of those two files, or after a bank launch changes
# the "N of M banks live" figures the og card echoes.
#
#   sh site/og.sh
#
# Set OG_CHROME=/path/to/chrome to point at a specific browser binary.

set -eu

here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)

find_chrome() {
  if [ -n "${OG_CHROME:-}" ]; then
    printf '%s\n' "$OG_CHROME"
    return 0
  fi
  for bin in google-chrome chromium chrome; do
    if command -v "$bin" >/dev/null 2>&1; then
      command -v "$bin"
      return 0
    fi
  done
  mac_chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  if [ -x "$mac_chrome" ]; then
    printf '%s\n' "$mac_chrome"
    return 0
  fi
  return 1
}

if ! chrome=$(find_chrome); then
  echo "og.sh: no Chrome/Chromium binary found -- install one, or set" >&2
  echo "       OG_CHROME=/path/to/chrome" >&2
  exit 1
fi

png="$here/og.png"
rm -f "$png"

# file:// works here: og.html's @font-face rules pull IBM Plex from a
# relative site/fonts/ URL, and Chrome resolves those fine from a file://
# document in the same directory tree -- verified with document.fonts
# before shipping this. If that ever regresses, serve the directory with
# `python3 -m http.server` instead of adding a second untested path.
"$chrome" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1200,630 \
  --virtual-time-budget=5000 --screenshot="$png" \
  "file://$here/og.html"

# PNG magic + IHDR must say exactly 1200x630 (same check as build.sh's check_og).
python3 - "$png" <<'PY'
import struct
import sys

path = sys.argv[1]
with open(path, "rb") as f:
    head = f.read(24)

if head[:8] != b"\x89PNG\r\n\x1a\n" or head[12:16] != b"IHDR":
    print(f"og.sh: {path} is not a PNG", file=sys.stderr)
    sys.exit(1)

got = struct.unpack(">II", head[16:24])
if got != (1200, 630):
    print(f"og.sh: {path} is {got[0]}x{got[1]}, want 1200x630", file=sys.stderr)
    sys.exit(1)
PY

echo "og.sh: wrote site/og.png"
