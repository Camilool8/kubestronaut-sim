#!/usr/bin/env bash
# Has an upstream certification curriculum moved ahead of the Kubernetes
# version this repository declares?
#
# Issue #105 asked for a watch on one move — CKAD to 1.36. A one-shot watch is
# spent the moment it fires, and the same question is asked again at 1.37, and
# again for every certification the repo grows a bank for. So nothing here
# names a version. The declared side is read out of the tree by
# tests/check-k8s-pins.sh; the upstream side is parsed out of whatever
# cncf/curriculum happens to publish today. A CKAD_Curriculum_v1.37.pdf is
# caught with no edit to this file, and so is a CKA one the day a CKA bank
# lands.
#
#   curriculum-watch.sh              compare, and open an issue if behind
#   curriculum-watch.sh --dry-run    compare, and print the issue it would open
#
# Environment:
#   CURRICULUM_REPO             upstream repo, default cncf/curriculum
#   CURRICULUM_WATCH_ROOT       tree to read the declared versions from
#   CURRICULUM_WATCH_DRY_RUN    non-empty is --dry-run
#   CURRICULUM_WATCH_LABEL      label for the issue, default "environment"
#   CURRICULUM_LISTING_FILE     read the upstream file list from here instead
#                               of the API (tests: fixture the transport, run
#                               the real parser)
#   CURRICULUM_ISSUES_FILE      read the existing-issue listing from here
#                               instead of the API, same reason
#
# It fails, loudly, rather than reporting "nothing to do", when it cannot read
# the upstream listing, when that listing yields no versioned curriculum at
# all, when the declared side cannot be read, or when not one of the
# certifications this repo tracks could be compared. A watcher that finds
# nothing looks exactly like a watcher that found nothing to report, and the
# difference is the whole value of it.
set -uo pipefail

CURRICULUM_REPO=${CURRICULUM_REPO:-cncf/curriculum}
LABEL=${CURRICULUM_WATCH_LABEL:-environment}
DRY_RUN=${CURRICULUM_WATCH_DRY_RUN:-}

case ${1:-} in
  --dry-run) DRY_RUN=1 ;;
  "") ;;
  *) echo "usage: $(basename "$0") [--dry-run]" >&2; exit 2 ;;
esac

self_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
root=${CURRICULUM_WATCH_ROOT:-$self_dir/../..}
cd "$root" || exit 1
root=$PWD

say()   { echo "curriculum-watch: $*"; }
fatal() { echo "curriculum-watch: $*" >&2; exit 1; }

command -v jq >/dev/null 2>&1 || fatal "jq is required"

# ----------------------------------------------------------------- versioning
#
# 1.9 sorts after 1.10 as a string, and every version comparison written with
# `<` or sort(1) has that bug waiting in it. Compare field by field, as
# numbers. 10# keeps a zero-padded field out of octal.
version_gt() {
  local a=$1 b=$2 i x y
  local -a A B
  IFS=. read -r -a A <<<"$a"
  IFS=. read -r -a B <<<"$b"
  i=0
  while [ "$i" -lt 4 ]; do
    x=$((10#${A[$i]:-0}))
    y=$((10#${B[$i]:-0}))
    [ "$x" -gt "$y" ] && return 0
    [ "$x" -lt "$y" ] && return 1
    i=$((i + 1))
  done
  return 1
}

# --------------------------------------------------------------- the upstream
#
# The listing is fetched whole and parsed here rather than asked for by name,
# because the name is the thing that changes. Preferred source is the recursive
# git tree, which finds a curriculum that has been moved into a per-exam
# subdirectory; the flat root listing is the fallback for the day the tree API
# answers differently.
api() {
  local path=$1
  if command -v gh >/dev/null 2>&1; then
    gh api -H "Accept: application/vnd.github+json" "$path" 2>/dev/null
    return
  fi
  local -a curl_args
  curl_args=(-fsSL -H "Accept: application/vnd.github+json")
  [ -n "${GH_TOKEN:-}" ] && curl_args+=(-H "Authorization: Bearer $GH_TOKEN")
  curl "${curl_args[@]}" "https://api.github.com/$path" 2>/dev/null
}

upstream_paths() {
  if [ -n "${CURRICULUM_LISTING_FILE:-}" ]; then
    cat -- "$CURRICULUM_LISTING_FILE"
    return
  fi
  local branch out
  branch=$(api "repos/$CURRICULUM_REPO" | jq -r '.default_branch // empty')
  if [ -n "$branch" ]; then
    out=$(api "repos/$CURRICULUM_REPO/git/trees/$branch?recursive=1" \
      | jq -r '.tree[]? | select(.type=="blob") | .path')
    if [ -n "$out" ]; then
      printf '%s\n' "$out"
      return
    fi
  fi
  api "repos/$CURRICULUM_REPO/contents" \
    | jq -r '.[]? | select(.type=="file") | .name'
}

# stdin: paths. stdout: CERT<TAB>VERSION, version empty when the name carries
# none. The certification is the leading token of the filename — CKAD out of
# CKAD_Curriculum_v1.35.pdf, CKS out of "CKS_Curriculum v1.34.pdf", which uses
# a space where its neighbours use an underscore. The version is the first
# vN.N in the name. old-versions/ is the repo's own archive and is skipped, or
# a superseded "coming soon" PDF could be read as news.
parse_curricula() {
  local path name cert ver
  local certre='^([A-Za-z][A-Za-z0-9]*)'
  local verre='[vV]([0-9]+\.[0-9]+([.][0-9]+)?)'
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    case $path in
      old-versions/*|*/old-versions/*) continue ;;
    esac
    name=${path##*/}
    case $name in
      *.pdf|*.PDF) ;;
      *) continue ;;
    esac
    [[ $name =~ $certre ]] || continue
    cert=$(printf '%s' "${BASH_REMATCH[1]}" | tr '[:lower:]' '[:upper:]')
    ver=''
    [[ $name =~ $verre ]] && ver=${BASH_REMATCH[1]}
    printf '%s\t%s\n' "$cert" "$ver"
  done
}

paths=$(upstream_paths)
[ -n "$paths" ] || fatal "could not read the file listing of $CURRICULUM_REPO"

pairs=$(printf '%s\n' "$paths" | parse_curricula)
[ -n "$pairs" ] || fatal "read $CURRICULUM_REPO but recognised no curriculum in it — the layout changed"

# Highest version per certification.
upstream_certs=$(printf '%s\n' "$pairs" | cut -f1 | sort -u)
upstream_table=''
versioned=0
unversioned=''
for cert in $upstream_certs; do
  best=''
  for v in $(printf '%s\n' "$pairs" | awk -F'\t' -v c="$cert" '$1==c && $2!=""{print $2}'); do
    if [ -z "$best" ] || version_gt "$v" "$best"; then best=$v; fi
  done
  if [ -n "$best" ]; then
    upstream_table="${upstream_table}${cert}	${best}
"
    versioned=$((versioned + 1))
  else
    unversioned="$unversioned $cert"
  fi
done

[ "$versioned" -gt 0 ] \
  || fatal "$CURRICULUM_REPO published $(printf '%s\n' "$upstream_certs" | wc -l | tr -d ' ') curricula, none carrying a version — the naming changed"

upstream_version_of() { # cert -> version, empty when upstream publishes none
  printf '%s' "$upstream_table" | awk -F'\t' -v c="$1" '$1==c{print $2; exit}'
}

say "$CURRICULUM_REPO publishes $versioned versioned curricula"
printf '%s' "$upstream_table" | while IFS='	' read -r c v; do
  printf '    %-8s %s\n' "$c" "$v"
done
[ -n "$unversioned" ] && printf '    %s\n' "unversioned:$unversioned"

# --------------------------------------------------------------- the declared
#
# One source of truth for where the versions live, shared with the CI gate, so
# the watcher can never build a cutover list for a file the gate does not
# compare — or the other way round.
gate=$root/tests/check-k8s-pins.sh
[ -f "$gate" ] || fatal "$gate is missing; it is where the declared versions are read from"
pins=$(bash "$gate" --list) \
  || fatal "tests/check-k8s-pins.sh could not read the declared versions"
[ -n "$pins" ] || fatal "tests/check-k8s-pins.sh returned no pins"

say "this repository declares $(printf '%s\n' "$pins" | wc -l | tr -d ' ') pins"
printf '%s\n' "$pins" | while IFS='	' read -r path field raw ser cert; do
  printf '    %-30s %-18s %-14s %s\n' "$path" "$field" "$ser" "$cert"
done

# ------------------------------------------------------------- the comparison
compared=0
behind_certs=''
target=''
report=''
for cert in $(printf '%s\n' "$pins" | cut -f5 | sort -u); do
  case $cert in
    -|NONE|'') continue ;;
  esac
  up=$(upstream_version_of "$cert")
  # The LOWEST of the banks carrying this certification, not the first one
  # listed. tests/check-k8s-pins.sh already fails CI if they disagree, but if
  # one ever slips through, the watcher should notice the laggard rather than
  # whichever bank sorts first.
  declared=''
  for v in $(printf '%s\n' "$pins" | awk -F'\t' -v c="$cert" '$5==c{print $4}'); do
    if [ -z "$declared" ] || version_gt "$declared" "$v"; then declared=$v; fi
  done
  if [ -z "$up" ]; then
    say "$cert: upstream publishes no version — not compared"
    report="${report}| $cert | — | $declared | upstream publishes no version |
"
    continue
  fi
  compared=$((compared + 1))
  if version_gt "$up" "$declared"; then
    say "$cert: upstream $up is AHEAD of the declared $declared"
    behind_certs="$behind_certs $cert"
    report="${report}| $cert | $up | $declared | **behind** |
"
    if [ -z "$target" ] || version_gt "$up" "$target"; then target=$up; fi
  else
    say "$cert: upstream $up, declared $declared — level"
    report="${report}| $cert | $up | $declared | level |
"
  fi
done

[ "$compared" -gt 0 ] \
  || fatal "not one certification this repository tracks could be compared against $CURRICULUM_REPO"

if [ -z "$behind_certs" ]; then
  say "$compared certification(s) compared, none behind — nothing to do, no issue opened"
  exit 0
fi

# ------------------------------------------------------------------ the issue
#
# The title is a pure function of the target version, which is what makes a
# second run idempotent: same target, same title, found, skipped.
title="Curriculum watch: upstream has moved to Kubernetes $target"

# Every pin behind the target, from what was actually read — not a list typed
# out here that would rot the first time a pin moves.
steps=''
declared_low=''
while IFS='	' read -r path field raw ser cert; do
  [ -n "$path" ] || continue
  version_gt "$target" "$ser" || continue
  if [ -z "$declared_low" ] || version_gt "$declared_low" "$ser"; then declared_low=$ser; fi
  case $field in
    NODE_IMAGE)
      steps="${steps}- [ ] \`$path\` — raise \`$field\` from \`$raw\` to the $target node image, **pinned by digest**
" ;;
    kubernetesVersion)
      steps="${steps}- [ ] \`$path\` — raise \`$field\` from \`$raw\` to \`$target\`
" ;;
    *)
      steps="${steps}- [ ] \`$path\` — raise \`$field\` from \`$raw\` to the latest $target patch
" ;;
  esac
done <<EOF
$pins
EOF

# The kubeadm config format switches from v1beta3 to v1beta4 at Kubernetes
# 1.36, so the step belongs on the issue only when the cutover crosses that
# line — and it names the files that actually mention v1beta3 today rather
# than asserting there are some.
if version_gt "1.36" "$declared_low" && ! version_gt "1.36" "$target"; then
  beta3=$(grep -rl 'v1beta3' images deploy 2>/dev/null | sort | tr '\n' ' ')
  if [ -n "$beta3" ]; then
    steps="${steps}- [ ] retarget the kubeadm config patches in \`${beta3% }\` from \`v1beta3\` to \`v1beta4\` — the format switches at Kubernetes 1.36
"
  else
    steps="${steps}- [ ] confirm no kubeadm config patch is pinned to \`v1beta3\` — the format switches to \`v1beta4\` at Kubernetes 1.36. Nothing in \`images/\` or \`deploy/\` mentions it today
"
  fi
fi

steps="${steps}- [ ] \`bash tests/check-k8s-pins.sh\` — every pin back on one minor
- [ ] \`bash tests/smoke.sh\` on a cold cache
"

body="The Kubernetes version this repository declares is behind the curriculum published upstream in [\`$CURRICULUM_REPO\`](https://github.com/$CURRICULUM_REPO).

| Certification | Upstream | Declared | |
| --- | --- | --- | --- |
${report}
## Cutover

${steps}
Opened automatically by \`.github/workflows/curriculum-watch.yml\`. It will not
open a second copy of this issue while one with this title exists. Close it
once the pins are raised; if the move is not one this repository should follow,
close it and the watch stays quiet until upstream moves again.

<!-- curriculum-watch:$target -->"

echo
echo "----- issue title -----"
printf '%s\n' "$title"
echo "----- issue body -----"
printf '%s\n' "$body"
echo "----- end -----"
echo

target_repo=${GITHUB_REPOSITORY:-}
if [ -z "$target_repo" ] && command -v gh >/dev/null 2>&1; then
  target_repo=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)
fi
[ -n "$target_repo" ] || fatal "cannot tell which repository to open the issue in; set GITHUB_REPOSITORY"

# A REST listing, not the search index. Search is eventually consistent and can
# be minutes behind a just-created issue, which is exactly the window a second
# run would land in and open a duplicate. `--state all` also means an issue a
# human closed deliberately is not reopened week after week.
existing_json() {
  if [ -n "${CURRICULUM_ISSUES_FILE:-}" ]; then
    cat -- "$CURRICULUM_ISSUES_FILE"
    return
  fi
  gh issue list --repo "$target_repo" --state all --limit 500 \
    --json number,title,state
}

# Without this, a missing gh reaches the duplicate search, finds nothing,
# and the run goes on to "open" an issue that never existed.
if [ -z "${CURRICULUM_ISSUES_FILE:-}" ] && ! command -v gh >/dev/null 2>&1; then
  fatal "gh is required to look up or open the issue"
fi

found=$(existing_json | jq -r --arg t "$title" \
  'map(select(.title == $t)) | .[0] | select(.) | "\(.number)\t\(.state)"')

if [ -n "$found" ]; then
  say "already tracked by #$(printf '%s' "$found" | cut -f1) ($(printf '%s' "$found" | cut -f2)) — not opening a duplicate"
  exit 0
fi

if [ -n "$DRY_RUN" ]; then
  say "DRY RUN — would run:"
  echo "    gh issue create --repo $target_repo --label $LABEL --title '$title' --body-file -"
  exit 0
fi

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
printf '%s\n' "$body" > "$tmp"

if url=$(gh issue create --repo "$target_repo" --title "$title" \
  --body-file "$tmp" --label "$LABEL" 2>&1); then
  say "opened $url"
  exit 0
fi
say "could not label the issue ($LABEL) — retrying without it"
url=$(gh issue create --repo "$target_repo" --title "$title" --body-file "$tmp") \
  || fatal "could not open the issue"
say "opened $url"
