#!/usr/bin/env bash
# The Kubernetes minor this repository targets is declared in four kinds of
# place. A cutover that raises three of them and forgets the fourth builds a
# cluster whose kubectl, whose node image and whose catalog card disagree with
# each other, and nothing else in CI notices — the images still build, the
# banks still load, and the candidate is told they are attempting a version
# they are not. This compares them.
#
# Only the MINOR series is compared. The patch levels differ on purpose:
# images/k8s-env pins kubectl v1.35.6 against kindest/node v1.35.5, and
# images/instance ships v1.35.0. kubectl is supported one minor either side of
# the API server, so patch drift is not a defect. A minor drift is.
#
#   check-k8s-pins.sh          compare every pin and report
#   check-k8s-pins.sh --list   print the pin table and stop. One row per pin,
#                              TAB separated: path, field, raw value, series,
#                              certification ("-" when the pin is not a bank).
#                              .github/scripts/curriculum-watch.sh reads this,
#                              so the watcher and this gate can never disagree
#                              about where the versions live.
#
# --list still fails on a pin it cannot find. A watcher handed a half table
# would report a clean cutover list for a file it never read.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

list_only=0
case ${1:-} in
  --list) list_only=1 ;;
  "") ;;
  *) echo "usage: $(basename "$0") [--list]" >&2; exit 2 ;;
esac

# Where the non-bank pins live. path:ARG name:kind. The kind decides how the
# version is dug out of the raw value, because NODE_IMAGE carries a digest and
# KUBECTL_VERSION does not.
IMAGE_PINS='images/k8s-env/Dockerfile:KUBECTL_VERSION:kubectl
images/k8s-env/Dockerfile:NODE_IMAGE:node
images/instance/Dockerfile:KUBECTL_VERSION:kubectl'

VERSION_RE='^([0-9]+)\.([0-9]+)([.][0-9]+)?$'
DIGEST_RE='@sha256:[0-9a-f]{64}$'

fail=0
problem() { echo "check-k8s-pins: $1" >&2; fail=1; }

# 1.35.6 -> 1.35. Empty output means the argument was not a version at all.
series() {
  [[ $1 =~ $VERSION_RE ]] || return 1
  printf '%s.%s' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
}

# The value of `ARG <name>=<value>` in a Dockerfile, first occurrence wins.
docker_arg() {
  local file=$1 name=$2 line re
  re="^[[:space:]]*ARG[[:space:]]+${name}=([^[:space:]]+)"
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ $line =~ $re ]]; then
      printf '%s' "${BASH_REMATCH[1]}"
      return 0
    fi
  done < "$file"
  return 1
}

rows=()
abstained=()

# ------------------------------------------------------------------ the banks
#
# spec.kubernetesVersion is documented as informational and is not required by
# the loader, so a bank that omits it is not an error — but it is named below
# rather than skipped in silence, which is the only way an omission stays
# visible.
#
# The value is captured with a pattern that accepts anything, then checked,
# rather than with one that only matches a version. A pattern that only matches
# a version turns `kubernetesVersion: "latest"` into "this bank declares
# nothing" — the bank drops out of the comparison and the gate goes green over
# a pin nobody is watching.
certre="^[[:space:]]*certification:[[:space:]]*[\"']?([^\"'[:space:]#]*)"
verre="^[[:space:]]*kubernetesVersion:[[:space:]]*[\"']?([^\"'[:space:]#]*)"
for f in banks/*/exam.yaml; do
  [ -f "$f" ] || continue
  cert='-'
  ver=''
  declares=0
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ $line =~ $certre ]]; then
      [ -n "${BASH_REMATCH[1]}" ] && cert=${BASH_REMATCH[1]}
    elif [[ $line =~ $verre ]]; then
      declares=1
      ver=${BASH_REMATCH[1]}
    fi
  done < "$f"

  if [ "$declares" = 0 ]; then
    abstained+=("$f")
    continue
  fi
  if [ -z "$ver" ]; then
    problem "$f: kubernetesVersion is declared with no value"
    continue
  fi
  if ! s=$(series "$ver"); then
    problem "$f: kubernetesVersion '$ver' is not a version"
    continue
  fi
  rows+=("$f	kubernetesVersion	$ver	$s	$cert")
done

# ----------------------------------------------------------------- the images
while IFS=: read -r file name kind; do
  [ -n "$file" ] || continue
  if [ ! -f "$file" ]; then
    problem "$file: expected to declare $name, but the file is gone — move the pin or fix this gate"
    continue
  fi
  if ! raw=$(docker_arg "$file" "$name"); then
    problem "$file: no 'ARG $name=' line — the pin moved or was renamed"
    continue
  fi

  case $kind in
    kubectl)
      ver=${raw#v}
      ;;
    node)
      # kindest/node:v1.35.5@sha256:ce97… — the digest is the point of the pin,
      # so demand it, then cut it off before reading the tag. Reading the tag
      # first would drag 64 hex characters into the version.
      if ! [[ $raw =~ $DIGEST_RE ]]; then
        problem "$file: $name is not pinned by digest: $raw"
        continue
      fi
      tag=${raw%%@*}
      ver=${tag##*:}
      ver=${ver#v}
      ;;
    *)
      problem "unknown pin kind '$kind' for $file:$name"
      continue
      ;;
  esac

  if ! s=$(series "$ver"); then
    problem "$file: $name='$raw' does not carry a Kubernetes version"
    continue
  fi
  rows+=("$file	$name	$raw	$s	-")
done <<EOF
$IMAGE_PINS
EOF

# ---------------------------------------------------------------- the verdict
#
# Nothing found is red, never green. A gate that quietly compares an empty set
# passes forever and tells you nothing, which is how this repository shipped a
# check that could not fail once already.
if [ ${#rows[@]} -eq 0 ]; then
  echo "check-k8s-pins: found no version pins at all — the pin table is wrong, refusing to pass" >&2
  exit 1
fi

if [ "$list_only" = 1 ]; then
  [ "$fail" = 0 ] || exit 1
  printf '%s\n' "${rows[@]}"
  exit 0
fi

# The reference is the series most pins are on, so the stragglers are the ones
# marked. Taking the first row instead would point at four banks when it was
# one Dockerfile that was forgotten.
wanted=''
best=0
for candidate in $(printf '%s\n' "${rows[@]}" | cut -f4 | sort -u); do
  n=$(printf '%s\n' "${rows[@]}" | cut -f4 | grep -c "^${candidate}\$")
  if [ "$n" -gt "$best" ]; then
    best=$n
    wanted=$candidate
  fi
done

disagree=0
for row in "${rows[@]}"; do
  [ "$(printf '%s' "$row" | cut -f4)" = "$wanted" ] || disagree=1
done

if [ "$disagree" != 0 ]; then
  echo "check-k8s-pins: the Kubernetes pins do not agree." >&2
  echo >&2
  for row in "${rows[@]}"; do
    s=$(printf '%s' "$row" | cut -f4)
    mark='  '
    [ "$s" = "$wanted" ] || mark='->'
    printf '%s %-32s %-18s %-6s %s\n' "$mark" \
      "$(printf '%s' "$row" | cut -f1)" \
      "$(printf '%s' "$row" | cut -f2)" \
      "$s" \
      "$(printf '%s' "$row" | cut -f3)" >&2
  done
  echo >&2
  echo "Every pin above must be on the same Kubernetes minor. Patch levels may" >&2
  echo "differ; minors may not. Raise the marked pins to ${wanted}, or lower the" >&2
  echo "rest, then rebuild:" >&2
  echo "  docker build images/k8s-env && docker build images/instance" >&2
  exit 1
fi

# A pin that could not be read at all was reported as it was found; it is still
# a failure, and the agreement above proves nothing without it.
if [ "$fail" != 0 ]; then
  echo "check-k8s-pins: the pins that could be read all agree on ${wanted}, but the" >&2
  echo "                problems above mean the comparison is incomplete." >&2
  exit 1
fi

for row in "${rows[@]}"; do
  printf '  %-32s %-18s %s\n' \
    "$(printf '%s' "$row" | cut -f1)" \
    "$(printf '%s' "$row" | cut -f2)" \
    "$(printf '%s' "$row" | cut -f3)"
done
if [ ${#abstained[@]} -gt 0 ]; then
  for f in "${abstained[@]}"; do
    printf '  %-32s %s\n' "$f" "(declares no kubernetesVersion — not compared)"
  done
fi
echo "check-k8s-pins: ${#rows[@]} pins, all on Kubernetes ${wanted}"
