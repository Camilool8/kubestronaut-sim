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

# An ERR trap is not inherited by shell functions unless errtrace is on, so a
# script that installs one without -E reports the failures that happen at its
# top level and silently misses every failure inside a function. That is not a
# style point: images/k8s-env/bootstrap.sh shipped this way, and a failed image
# preload exited the script without ever recording it, leaving boot.json on
# "booting" and `./sim up` polling a dead boot until its budget ran out.
trapped=0
for f in "${files[@]}"; do
  grep -qE '^[[:space:]]*trap[[:space:]].*[[:space:]]ERR([[:space:]]|$)' "$f" || continue
  trapped=$((trapped + 1))
  grep -qE '^[[:space:]]*set[[:space:]]+-[a-zA-Z]*E|^[[:space:]]*set[[:space:]]+-o[[:space:]]+errtrace' "$f" && continue
  echo "$f installs an ERR trap but does not set -E (errtrace)." >&2
  echo "    Without it the trap never fires for a failure inside a function," >&2
  echo "    so the script dies under -e with the failure unrecorded." >&2
  echo "    Add -E to its set line, or drop the trap." >&2
  fail=1
done

# An assignment from a command substitution takes that substitution's exit
# status, so under `set -e` (with `pipefail`, which every setup.sh here also
# sets) `x=$(kubectl get deploy foo -o json | jq …)` ENDS THE SCRIPT when foo
# does not exist. That is the shape every idempotent seed reaches for — read the
# object, decide whether a previous candidate drifted it — and the cold path,
# where the object has not been created yet, is exactly the path where it is
# fatal. Two questions shipped with it and died on a fresh cluster at the line
# written to handle a re-seed; shellcheck has no rule for it, and the seed's own
# `${x:-default}` further down reads like a guard while being unreachable.
#
# The fix is one clause: `… ) || x=default`. So the rule is narrow — an
# assignment whose substitution runs a command that can legitimately fail, with
# no `||` anywhere in the statement. Quoted text is blanked before the parens
# are balanced, or every jq filter would end the statement early.
python3 - "${files[@]}" <<'PY' || fail=1
import re, sys

# Comments go too, and not as a nicety: a comment containing an apostrophe
# ("the candidate's") would otherwise open a quote that swallows the code
# after it, and the scan would sail past the very assignments it is looking
# for. This is why the rule is proved by breaking a guarded line and watching
# it go red, rather than by observing that the tree is green.
def blank_quotes(s):
    out, i, q = [], 0, None
    while i < len(s):
        c = s[i]
        if q is None:
            if c == '#' and (not out or out[-1] in ' \t\n'):
                j = s.find('\n', i)
                if j == -1:
                    out.append(' ' * (len(s) - i)); break
                out.append(' ' * (j - i)); i = j; continue
            if c in "'\"":
                q = c; out.append(' ')
            else:
                out.append(c)
        else:
            if c == '\\' and q == '"':
                out.append('  '); i += 2; continue
            if c == q: q = None
            out.append(' ')
        i += 1
    return ''.join(out)

RISKY = re.compile(r'\b(kubectl|kind|docker|helm|jq|yq|awk|grep|curl|ssh)\b')
bad = 0
for path in sys.argv[1:]:
    if not path.endswith('setup.sh'):
        continue
    text = open(path, encoding='utf-8').read()
    if not re.search(r'(?m)^\s*set -[a-zA-Z]*e', text):
        continue
    flat = blank_quotes(text)
    for m in re.finditer(r'(?m)^[ \t]*(?:local +)?[A-Za-z_]\w*=\$\(', flat):
        i, depth = m.end() - 1, 0
        while i < len(flat):
            if flat[i] == '(':
                depth += 1
            elif flat[i] == ')':
                depth -= 1
                if depth == 0:
                    break
            i += 1
        eol = flat.find('\n', i)
        eol = len(flat) if eol == -1 else eol
        if not RISKY.search(flat[m.end():i]):
            continue
        if '||' in flat[m.start():eol]:
            continue
        line = text.count('\n', 0, m.start()) + 1
        first = text[m.start():eol].splitlines()[0].strip()
        print(f"{path}:{line} assigns from a command substitution with no fallback: {first}",
              file=sys.stderr)
        bad += 1
if bad:
    print(f"check-shell: {bad} assignment(s) above end the seed under `set -e` when the",
          file=sys.stderr)
    print("             command inside fails — which on a cold cluster is the normal case.",
          file=sys.stderr)
    print("             Add a fallback: `x=$(…) || x=<default>` (or `|| true`).", file=sys.stderr)
    sys.exit(1)
PY

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
    echo "check-shell: ${#files[@]} scripts parse and lint clean at severity=${SEVERITY}; ${trapped} install an ERR trap, all with -E"
  else
    echo "check-shell: ${#files[@]} scripts parse — NOT linted, see above"
  fi
fi

exit $fail
