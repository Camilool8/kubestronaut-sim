#!/usr/bin/env sh
# No tracked script may carry CRLF. A CR in a shebang breaks the container
# that COPYs it, as 'env: bash\r: No such file or directory'.
set -eu
cd "$(dirname "$0")/.."

bad=$(git ls-files -z -- 'sim' '*.sh' | xargs -0 grep -lI "$(printf '\r')$" 2>/dev/null || true)

if [ -n "$bad" ]; then
  echo "check-line-endings: CRLF found in tracked scripts:" >&2
  printf '  %s\n' $bad >&2
  echo >&2
  echo "These break inside the containers that COPY them. With .gitattributes" >&2
  echo "in place, fix the working tree with:  git add --renormalize ." >&2
  exit 1
fi

echo "check-line-endings: $(git ls-files -- 'sim' '*.sh' | wc -l | tr -d ' ') tracked scripts, all LF"
