#!/usr/bin/env bash
# points: 3
# desc: an ephemeral container runs busybox:1.37 targeting api, in the original Pod
# expected: ephemeral.json json
set -uo pipefail
. /banks/_lib/checks.sh

# Mirrors the same best-candidate selection the crits below judge against —
# see the comment on $eph further down for why. The name is deliberately not
# part of the projection: it is not graded, for the same reason (an ephemeral
# container can never be removed, so a first attempt under the wrong name
# would be permanent and unfixable to hold against the candidate).
snapshot() {
  kubectl -n perseus get pod ledger-api -o json 2>/dev/null | jq -S '
    (.spec.ephemeralContainers // []) as $e
    | ( first($e[] | select(.image == "busybox:1.37" and .targetContainerName == "api"))
      // first($e[] | select(.targetContainerName == "api"))
      // first($e[] | select(.image == "busybox:1.37"))
      // $e[0] # lint: allow-index (last resort: judge whatever was attached, mirrors $eph below)
      // null ) as $c
    | if $c == null then null else {image: ($c.image // null), targetContainerName: ($c.targetContainerName // null)} end
  ' 2>/dev/null
}

evidence() {
  show_pair json ephemeral.json
  show_why "$1"
}

containers=$(kubectl -n perseus get pod ledger-api \
  -o jsonpath='{range .spec.containers[*]}{.name}{"\n"}{end}' 2>/dev/null)
[ -n "$containers" ] || {
  echo "there is no Pod ledger-api in perseus"
  show_why "Ephemeral containers are added to a Pod that exists. If it is gone, there is nothing to debug and nothing to attach to — and deleting it is the one thing the question rules out, because on a real incident the Pod IS the evidence."
  exit 1
}
same_set "$containers" "api" || {
  echo "the Pod's containers are '$(printf '%s' "$containers" | tr '\n' ' ')', want exactly one named api"
  show_actual text "containers that exist: $(name_list "$containers")"
  show_why "spec.containers is immutable on a running Pod, so a changed container list means the Pod was deleted and replaced. An ephemeral container is not added there — it lives in spec.ephemeralContainers, which is why it can be added to a Pod that is already running."
  exit 1
}

count=$(kubectl -n perseus get pod ledger-api -o json 2>/dev/null \
  | jq -r '.spec.ephemeralContainers // [] | length')
[ "${count:-0}" -gt 0 ] || {
  echo "the Pod has no ephemeral containers"
  evidence "An ephemeral container is added to a running Pod with kubectl debug, and it lands in spec.ephemeralContainers rather than spec.containers — which is why it can be attached to a Pod nobody wants to restart. Nothing has been attached to this one."
  exit 1
}

# Judge the container that does the job, not the one with the expected name. An
# ephemeral container can never be removed, so a first attempt under the wrong
# name — or with --target forgotten — is permanent, and holding the name against
# the candidate would make the whole check unrecoverable. Pick the best
# candidate: one that does both, else one that does either, else the first.
eph=$(kubectl -n perseus get pod ledger-api -o json 2>/dev/null | jq -r '
  (.spec.ephemeralContainers // []) as $e
  | ( first($e[] | select(.image == "busybox:1.37" and .targetContainerName == "api"))
    // first($e[] | select(.targetContainerName == "api"))
    // first($e[] | select(.image == "busybox:1.37"))
    // $e[0] )')   # lint: allow-index (last resort: judge whatever was attached)

img=$(printf '%s' "$eph" | jq -r '.image // ""')
target=$(printf '%s' "$eph" | jq -r '.targetContainerName // ""')

crit 1 "runs busybox:1.37" \
  "the ephemeral container runs '$img', want busybox:1.37" \
  -- [ "$img" = "busybox:1.37" ]
crit 3 "shares the api container's process namespace" \
  "targetContainerName is '$target', want api" \
  -- [ "$target" = "api" ]

crit_all_passed || evidence "Two flags carry this task. --image picks a debugging image that has the tools the application image does not ship. --target joins ANOTHER container's process namespace: without it an ephemeral container shares the Pod's network and IPC but gets a process namespace of its own, so ps shows only itself. Any one ephemeral container satisfying both is accepted — the name is not graded, because an ephemeral container can never be removed and a wrong one would be unfixable."
report "ephemeral debugger attached"
