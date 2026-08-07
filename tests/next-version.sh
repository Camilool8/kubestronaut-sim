#!/usr/bin/env bash
# The release tag is computed, not typed, so the thing that computes it is worth
# testing before it decides a version nobody can take back.
set -uo pipefail
cd "$(dirname "$0")/.."

SCRIPT=.github/scripts/next-version.py

PASS=0
FAIL=0

# next <current> <commit subject/body>... -> the version it would tag
next() {
  local current=$1
  shift
  local out
  out=$(printf '%s\0' "$@" | python3 "$SCRIPT" "$current" 2>/dev/null)
  printf '%s' "$out"
}

ok() {
  if [ "$2" = "$3" ]; then PASS=$((PASS+1));
  else echo "FAIL: $1 — got '$2', want '$3'"; FAIL=$((FAIL+1)); fi
}

# --- the three sizes -------------------------------------------------------
ok "fix is a patch"    "$(next v0.1.5 'fix(ui): stop the panel collapsing')" "v0.1.6"
ok "feat is a minor"   "$(next v0.1.5 'feat(site): add a pricing page')"     "v0.2.0"
ok "chore is a patch"  "$(next v0.1.5 'chore: bump deps')"                   "v0.1.6"
ok "docs is a patch"   "$(next v0.1.5 'docs: fix a typo')"                   "v0.1.6"

# This repo's history is full of subject prefixes that are not conventional
# types. They have to count as a patch: treating them as "no release" would
# silently drop most of the log.
ok "grade: is a patch"   "$(next v0.1.5 'grade: score checks by criteria')"  "v0.1.6"
ok "site: is a patch"    "$(next v0.1.5 'site: restructure the landing page')" "v0.1.6"
ok "no prefix is a patch" "$(next v0.1.5 'Merge pull request #69 from a/b')" "v0.1.6"
ok "bare subject"        "$(next v0.1.5 'tidy up')"                          "v0.1.6"

# --- the largest bump wins, whatever order they arrive in -----------------
ok "feat beats fix"       "$(next v0.1.5 'fix: a' 'feat: b' 'chore: c')"     "v0.2.0"
ok "order does not matter" "$(next v0.1.5 'feat: b' 'fix: a')"               "v0.2.0"

# --- breaking changes ------------------------------------------------------
# On 0.x a breaking change is a MINOR bump, so v1.0.0 stays a manual decision.
ok "feat! on 0.x is a minor"  "$(next v0.1.5 'feat!: drop the old bank format')" "v0.2.0"
ok "fix! on 0.x is a minor"   "$(next v0.1.5 'fix!: rename a flag')"             "v0.2.0"
ok "scoped feat! on 0.x"      "$(next v0.1.5 'feat(api)!: change a response')"   "v0.2.0"
ok "footer on 0.x is a minor" \
   "$(next v0.1.5 "$(printf 'refactor: rework the grader\n\nBREAKING CHANGE: check output changed')")" "v0.2.0"

# Past 1.0 the same commits mean major.
ok "feat! past 1.0"    "$(next v1.4.2 'feat!: drop the old bank format')" "v2.0.0"
ok "footer past 1.0" \
   "$(next v1.4.2 "$(printf 'refactor: rework it\n\nBREAKING CHANGE: output changed')")" "v2.0.0"
ok "BREAKING-CHANGE hyphen" \
   "$(next v1.4.2 "$(printf 'refactor: rework it\n\nBREAKING-CHANGE: output changed')")" "v2.0.0"
ok "feat past 1.0 is a minor" "$(next v1.4.2 'feat: add a thing')" "v1.5.0"
ok "fix past 1.0 is a patch"  "$(next v1.4.2 'fix: fix a thing')"  "v1.4.3"

# A footer has to start its own line — prose that mentions it is not a
# declaration, and misreading one would ship a major nobody asked for.
ok "prose is not a footer" \
   "$(next v1.4.2 "$(printf 'docs: explain what a BREAKING CHANGE: footer does')")" "v1.4.3"
ok "indented footer is prose" \
   "$(next v1.4.2 "$(printf 'docs: a note\n\n  BREAKING CHANGE: quoted from the spec')")" "v1.4.3"

# --- nothing to release ----------------------------------------------------
printf '' | python3 "$SCRIPT" v0.1.5 >/dev/null 2>&1
ok "no commits exits 3" "$?" "3"
ok "no commits prints nothing" "$(printf '' | python3 "$SCRIPT" v0.1.5 2>/dev/null)" ""
printf '\0\0' | python3 "$SCRIPT" v0.1.5 >/dev/null 2>&1
ok "blank commits exit 3" "$?" "3"

# --- refusing to guess -----------------------------------------------------
printf 'fix: a\0' | python3 "$SCRIPT" not-a-version >/dev/null 2>&1
ok "a bad current version fails" "$([ $? -ne 0 ] && echo yes)" "yes"
printf 'fix: a\0' | python3 "$SCRIPT" >/dev/null 2>&1
ok "no argument fails" "$?" "2"

# The v prefix is optional going in and always present coming out, because the
# tag carries it and Chart.yaml's version field does not.
ok "accepts a bare version" "$(next 0.1.5 'fix: a')" "v0.1.6"

echo
echo "next-version: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
