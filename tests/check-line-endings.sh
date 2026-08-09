#!/usr/bin/env sh
# No tracked script or images/k8s-env/preload.txt may carry CRLF. A CR in a
# shebang breaks the container that COPYs it, as 'env: bash\r: No such file
# or directory'.
set -eu
cd "$(dirname "$0")/.."

tracked=$(git ls-files -- 'sim' '*.sh' 'images/k8s-env/preload.txt')
if [ -z "$tracked" ]; then
  echo "check-line-endings: no tracked files matched — pathspec is wrong, refusing to pass" >&2
  exit 1
fi

bad=$(git ls-files -z -- 'sim' '*.sh' 'images/k8s-env/preload.txt' \
  | xargs -0 grep -lI "$(printf '\r')$" 2>/dev/null || true)

if [ -n "$bad" ]; then
  echo "check-line-endings: CRLF found in tracked scripts:" >&2
  printf '%s\n' "$bad" | while IFS= read -r f; do printf '  %s\n' "$f"; done >&2
  echo >&2
  echo "These break inside the containers that COPY them. Re-clone the repo —" >&2
  echo "with .gitattributes in place, a fresh clone checks these out as LF. If" >&2
  echo "you can't re-clone, force a re-checkout of every tracked file:" >&2
  echo "  git ls-files -z | xargs -0 rm -f && git checkout -- ." >&2
  echo "This discards any uncommitted changes to tracked files." >&2
  exit 1
fi

echo "check-line-endings: $(printf '%s\n' "$tracked" | wc -l | tr -d ' ') tracked scripts, all LF"
