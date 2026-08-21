#!/usr/bin/env bash
# points: 2
# desc: Pod telemetry runs containers app and adapter on busybox:1.37
# expected: containers.json json
set -uo pipefail
. /banks/_lib/checks.sh

# The Pod phase criterion below is a behavioural reading (has every container
# started), not a shape either container was authored with, so it is left out
# of the pane and rides on its own crit message instead.
snapshot() {
  kubectl -n pictor get pod telemetry -o json 2>/dev/null \
    | jq -S '{containers: ([.spec.containers[]? | {name, image}] | sort_by(.name))}' 2>/dev/null
}

evidence() {
  show_pair json containers.json
  show_why "$1"
}

names=$(kubectl -n pictor get pod telemetry \
  -o jsonpath='{range .spec.containers[*]}{.name}{"\n"}{end}' 2>/dev/null | sort | tr '\n' ' ')
names=${names% }
phase=$(kubectl -n pictor get pod telemetry -o jsonpath='{.status.phase}' 2>/dev/null)

crit 2 "one Pod holding both app and adapter" \
  "containers are '$names', want 'app' and 'adapter'" \
  "Both containers belong to the SAME Pod, which is what lets them share a volume and a network namespace — two Pods with one container each would share nothing. They are found by name, and an empty pane means no Pod called telemetry exists in pictor." \
  -- [ "$names" = "adapter app" ]

for c in app adapter; do
  img=$(kubectl -n pictor get pod telemetry \
    -o jsonpath="{.spec.containers[?(@.name==\"${c}\")].image}" 2>/dev/null)
  crit 1 "${c} runs busybox:1.37" \
    "container ${c} uses image '$img', want busybox:1.37" \
    "Both containers run the same image — the adapter pattern is about what a container DOES, not about it being special. Everything that distinguishes them is in the command each is given." \
    -- [ "$img" = "busybox:1.37" ]
done

crit 1 "the Pod is Running" \
  "pod phase is '$phase', want Running" \
  "A Pod is Running once every one of its containers has started. Both of these are shell loops that never end, so a container that exits took a command the shell could not run — the quoting in the loops has to survive both YAML and the shell, and getting it wrong produces a container that starts and immediately finishes." \
  -- [ "$phase" = "Running" ]

crit_all_passed || evidence "$(crit_why)"
report "containers ok"
