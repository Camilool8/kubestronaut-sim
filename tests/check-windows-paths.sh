#!/usr/bin/env sh
# No tracked path may be one Windows refuses to create, because git checks the
# whole tree out before any test in this repo gets to run: a single bad path
# fails `git checkout` with "error: invalid path", the working tree is left
# empty, and a Windows contributor cannot clone the repo at all. Nothing else
# here catches that — every other gate runs on Linux, where these paths are
# ordinary.
#
# Three ways a path is invalid on Windows, all of them fatal at checkout:
#
#   1. A component whose name before the first dot is a reserved DOS device —
#      CON, PRN, AUX, NUL, COM1-9, LPT1-9. The extension does not save it:
#      `aux.sh` is as invalid as `aux`, which is how banks/_lib/aux.sh (now
#      aux-cluster.sh) got as far as CI.
#   2. A component ending in a dot or a space, which the Win32 layer strips —
#      so the file git asks for and the file that appears are different files.
#   3. A component containing < > : " | ? * or a backslash.
set -eu
cd "$(dirname "$0")/.."

tracked=$(git ls-files)
if [ -z "$tracked" ]; then
  echo "check-windows-paths: no tracked files — pathspec is wrong, refusing to pass" >&2
  exit 1
fi

reserved='^(con|prn|aux|nul|com[1-9]|lpt[1-9])$'

bad=$(printf '%s\n' "$tracked" | awk -F/ -v reserved="$reserved" '
  {
    for (i = 1; i <= NF; i++) {
      c = $i
      stem = c
      sub(/\..*$/, "", stem)
      if (tolower(stem) ~ reserved) { print $0 "\treserved device name \"" c "\""; next }
      if (c ~ /[ .]$/)              { print $0 "\tcomponent \"" c "\" ends in a dot or a space"; next }
      if (c ~ /[<>:"|?*\\]/)        { print $0 "\tcomponent \"" c "\" has a character Windows forbids"; next }
    }
  }
')

if [ -n "$bad" ]; then
  echo "check-windows-paths: paths that Windows cannot check out:" >&2
  printf '%s\n' "$bad" | while IFS= read -r line; do printf '  %s\n' "$line" >&2; done
  echo >&2
  echo "git checkout fails outright on these, so the repo cannot be cloned on" >&2
  echo "Windows at all. Rename the file — a suffix is not enough, the reserved" >&2
  echo "name has to stop being the whole stem (aux.sh -> aux-cluster.sh)." >&2
  exit 1
fi

echo "check-windows-paths: $(printf '%s\n' "$tracked" | wc -l | tr -d ' ') tracked paths, all valid on Windows"
