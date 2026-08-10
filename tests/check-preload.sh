#!/usr/bin/env sh
# Two image tags must never reach images/k8s-env/preload.txt, because two
# questions are built on them NOT resolving: one image is meant to sit in
# ImagePullBackOff, the other is the unpullable tag the candidate has to read
# off a Deployment and correct. Preload either and the question grades itself
# green for work nobody did. Nothing else notices — the cluster comes up
# healthy, and only a smoke run on a cold cache would catch it.
#
# The rule lives in prose, in CONTRIBUTING.md under "Rules that are not
# negotiable". This gate READS that prose rather than restating it: the
# bullets under the paragraph naming preload.txt are the tag list, and the
# question each bullet cites is the question the failure names. Edit the
# document and the gate retargets itself; there is no second copy to drift.
#
# Reading the rule out of a document means the parse can come back empty, and
# a gate that passes on an empty set is the failure this repo has already
# shipped once (issue #82). So every step that could quietly find nothing —
# missing document, missing section, missing paragraph, no bullets, a bullet
# with no tag or no question, an empty preload list — is a loud failure, and
# a pass prints what it actually checked.
#
# Each tag is also confirmed against the question the prose attributes it to,
# so the question number in a failure message is one the tree agrees with.
# The rule named the wrong question until issue #88 corrected it by hand; no
# gate could have told you.
#
# Overrides exist so the guards above can be proved to fire:
#   PRELOAD_RULES_DOC   document to read the rule out of (default CONTRIBUTING.md)
#   PRELOAD_FILE        preload list to check (default images/k8s-env/preload.txt)
set -eu
cd "$(dirname "$0")/.."

rules=${PRELOAD_RULES_DOC:-CONTRIBUTING.md}
preload=${PRELOAD_FILE:-images/k8s-env/preload.txt}
tab=$(printf '\t')

if [ ! -f "$rules" ]; then
  echo "check-preload: $rules does not exist — the rule this gate enforces is" >&2
  echo "               written there, so there is nothing to enforce. Refusing" >&2
  echo "               to pass." >&2
  exit 1
fi
if [ ! -f "$preload" ]; then
  echo "check-preload: $preload does not exist — refusing to pass on a file" >&2
  echo "               that isn't there. If it moved, update this gate and" >&2
  echo "               images/k8s-env/Dockerfile together." >&2
  exit 1
fi

# ------------------------------------------------------- the rule, parsed
#
# Diagnostics go to stdout so the caller can relay them; a non-zero exit is
# what marks them as diagnostics rather than data.
if ! excluded=$(awk -v doc="$rules" '
function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }
function fail(msg) { diag[++diags] = msg; bad = 1 }

function emit(  s, lower, tag, q, reason, cut) {
  s = trim(item)
  item = ""
  if (s == "") return
  if (!match(s, /`[^`]+`/)) {
    fail("check-preload: " doc ": rule bullet names no `tag` in backticks:")
    fail("               " s)
    return
  }
  tag = substr(s, RSTART + 1, RLENGTH - 2)
  lower = tolower(s)
  if (match(lower, /question[^0-9]*[0-9]+/)) {
    q = substr(lower, RSTART, RLENGTH)
    sub(/^question[^0-9]*/, "", q)
  } else if (match(lower, /q[0-9]+/)) {
    q = substr(lower, RSTART + 1, RLENGTH - 1)
  } else {
    fail("check-preload: " doc ": rule bullet for `" tag "` names no question,")
    fail("               so a failure could not say what it breaks:")
    fail("               " s)
    return
  }
  reason = ""
  cut = index(s, "—")
  if (cut > 0) reason = trim(substr(s, cut + length("—")))
  if (reason == "") reason = s
  gsub(/[ \t]+/, " ", reason)
  rule[++n] = tag "\t" q "\t" reason
}

/^```/ { fence = 1 - fence; next }
fence { next }

/^#/ {
  hashes = 0
  while (substr($0, hashes + 1, 1) == "#") hashes++
  if (hashes <= 2 && substr($0, hashes + 1, 1) == " ") {
    if (insec) emit()
    insec = ($0 ~ /Rules that are not negotiable/)
    if (insec) sawsec = 1
    anchor = 0
    next
  }
}

!insec || done { next }

!anchor {
  if (index($0, "preload.txt") > 0) { anchor = 1; sawanchor = 1 }
  next
}

/^[-*][ \t]/ { emit(); item = substr($0, 3); next }
/^[ \t]+[^ \t]/ { if (item != "") item = item " " trim($0); next }
/^[ \t]*$/ { next }
{ if (n > 0 || item != "") { emit(); done = 1 } }

END {
  emit()
  if (!sawsec) {
    fail("check-preload: " doc " has no \"Rules that are not negotiable\"")
    fail("               section. The tag list is read out of it, so there is")
    fail("               nothing to enforce. Restore the section, or repoint")
    fail("               this gate at wherever the rule moved to.")
  } else if (!sawanchor) {
    fail("check-preload: " doc "\047s rules section no longer mentions")
    fail("               preload.txt. The tag list is read from the bullets")
    fail("               under that paragraph.")
  } else if (n == 0) {
    fail("check-preload: " doc ": found the preload.txt rule but no `tag`")
    fail("               bullets under it, so ZERO tags would be checked.")
    fail("               A gate that checks nothing must not pass.")
  }
  # Diagnostics and data never mix: one or the other leaves this program.
  if (bad) {
    for (i = 1; i <= diags; i++) print diag[i]
    exit 1
  }
  for (i = 1; i <= n; i++) print rule[i]
}
' "$rules"); then
  printf '%s\n' "$excluded" >&2
  exit 1
fi

# Belt and braces: awk guards this above, but a gate that checks nothing must
# never be one refactor away from passing.
if [ -z "$excluded" ]; then
  echo "check-preload: parsed zero excluded tags out of $rules — refusing to pass" >&2
  exit 1
fi

# ------------------------------------------------- the preload list, parsed
#
# Comment and blank handling mirrors images/k8s-env/Dockerfile, which feeds
# skopeo `grep -v '^[[:space:]]*#'` of this file: a commented tag is never
# pulled, so it is not a violation.
norm=$(awk '
{
  line = $0
  sub(/\r$/, "", line)
  if (line ~ /^[ \t]*#/) next
  parts = split(line, f, /[ \t]+/)
  tok = ""
  for (i = 1; i <= parts; i++) if (f[i] != "") { tok = f[i]; break }
  if (tok == "") next
  print NR "\t" tok
}' "$preload")

if [ -z "$norm" ]; then
  echo "check-preload: $preload has no image entries at all. It is never" >&2
  echo "               legitimately empty — either it was truncated or this" >&2
  echo "               gate is reading the wrong file. Refusing to pass." >&2
  exit 1
fi
entries=$(printf '%s\n' "$norm" | wc -l | tr -d ' ')

# --------------------------------------------------------------- the check
fail=0
checked=0
summary=""

while IFS="$tab" read -r tag question reason; do
  [ -n "$tag" ] || continue
  checked=$((checked + 1))

  # The question the prose blames must be a question that really uses the tag,
  # or the failure message below would name the wrong one.
  cands="q$question"
  case $question in
    [0-9]) cands="q$question q0$question" ;;
  esac
  owner=""
  for c in $cands; do
    for dir in banks/*/"$c"; do
      [ -d "$dir" ] || continue
      if grep -rqF -- "$tag" "$dir" 2>/dev/null; then
        owner=$dir
        break 2
      fi
    done
  done
  if [ -z "$owner" ]; then
    echo "check-preload: $rules says '$tag' is question $question's, but no file" >&2
    echo "               under banks/*/q$question/ uses that tag. Either the rule names" >&2
    echo "               the wrong question or the question moved. Fix the rule —" >&2
    echo "               until then a failure here would name a question that" >&2
    echo "               would not actually break." >&2
    fail=1
    continue
  fi

  hit=""
  while IFS="$tab" read -r lineno token; do
    raw=${token%%@*}
    base=${raw##*/}
    if [ "$raw" = "$tag" ] || [ "$base" = "$tag" ]; then
      hit=$lineno
      break
    fi
  done <<EOF
$norm
EOF

  if [ -n "$hit" ]; then
    echo "check-preload: $preload line $hit preloads '$tag'." >&2
    echo "               Question $question is built on that tag NOT resolving." >&2
    echo "               $rules, \"Rules that are not negotiable\", records why:" >&2
    echo "                 $tag — $reason" >&2
    echo "               ($owner is the question that breaks.)" >&2
    echo "               Delete the line. Preloading it makes the question grade" >&2
    echo "               itself green for work nobody did, and only a smoke run" >&2
    echo "               on a cold cache would notice." >&2
    fail=1
  else
    summary="$summary  $tag — absent, question $question ($owner)
"
  fi
done <<EOF
$excluded
EOF

if [ "$fail" != "0" ]; then
  exit 1
fi

echo "check-preload: $checked excluded tags from $rules, none of them in $preload ($entries entries)"
printf '%s' "$summary"
