#!/usr/bin/env bash
# Every tracked shell script parses, and passes ShellCheck.
#
# The set comes from git rather than a curated glob, because the curated glob
# this replaced missed two real scripts — one that ships to the candidate, one
# that runs in CI — and nothing could tell you it had. `--others` picks up a
# script you have written but not yet staged, so the gate sees it before the
# reviewer does; in CI's fresh checkout there are none, so the set is the same.
#
# The severity floor is `warning`. ShellCheck's `info` and `style` levels add
# 63 and 71 further findings here, none of them defects; adopting them would
# cost a suppression sweep for no bug caught. Raise the floor by lowering
# SEVERITY below, once the tree is clean at the next level down.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

SEVERITY=warning

files=()
while IFS= read -r f; do
  files+=("$f")
done < <(git ls-files --cached --others --exclude-standard sim '*.sh')

if [ "${#files[@]}" -eq 0 ]; then
  echo "check-shell: git ls-files found no shell scripts — is this a git checkout?" >&2
  exit 1
fi

fail=0
linted=0

for f in "${files[@]}"; do
  bash -n "$f" || { echo "syntax error: $f"; fail=1; }
done

# -x follows the `# shellcheck source=` directives in images/k8s-env, which
# would otherwise sit in the tree doing nothing.
if command -v shellcheck >/dev/null 2>&1; then
  shellcheck -x -S "$SEVERITY" -- "${files[@]}" || fail=1
  linted=1
elif [ -n "${SHELLCHECK_REQUIRED:-}" ]; then
  echo "check-shell: SHELLCHECK_REQUIRED is set and shellcheck is not installed" >&2
  fail=1
else
  echo "check-shell: shellcheck is not installed — the lint pass was SKIPPED." >&2
  echo "             CI sets SHELLCHECK_REQUIRED and will not skip it." >&2
  echo "             Install it: brew install shellcheck | apt-get install shellcheck" >&2
fi

if [ "$fail" = "0" ]; then
  if [ "$linted" = "1" ]; then
    echo "check-shell: ${#files[@]} scripts parse and lint clean at severity=${SEVERITY}"
  else
    echo "check-shell: ${#files[@]} scripts parse — NOT linted, see above"
  fi
fi

exit $fail
