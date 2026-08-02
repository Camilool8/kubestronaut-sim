#!/usr/bin/env bash
# points: 1
# desc: Pod telemetry runs containers app and adapter on busybox:1.37
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual json "$(kubectl -n pictor get pod telemetry -o json 2>/dev/null | jq '{containers: [.spec.containers[] | {name, image}], phase: .status.phase}')"
  show_why "$1"
}

names=$(kubectl -n pictor get pod telemetry \
  -o jsonpath='{range .spec.containers[*]}{.name}{"\n"}{end}' 2>/dev/null | sort | tr '\n' ' ')
names=${names% }
[ "$names" = "adapter app" ] || {
  echo "containers are '$names', want 'app' and 'adapter'"
  evidence "Both containers belong to the SAME Pod, which is what lets them share a volume and a network namespace — two Pods with one container each would share nothing. They are found by name, and an empty pane means no Pod called telemetry exists in pictor."
  exit 1
}

for c in app adapter; do
  img=$(kubectl -n pictor get pod telemetry \
    -o jsonpath="{.spec.containers[?(@.name==\"${c}\")].image}" 2>/dev/null)
  [ "$img" = "busybox:1.37" ] || {
    echo "container ${c} uses image '$img', want busybox:1.37"
    evidence "Both containers run the same image — the adapter pattern is about what a container DOES, not about it being special. Everything that distinguishes them is in the command each is given."
    exit 1
  }
done

phase=$(kubectl -n pictor get pod telemetry -o jsonpath='{.status.phase}' 2>/dev/null)
[ "$phase" = "Running" ] && echo "containers ok" || {
  echo "pod phase is '$phase', want Running"
  evidence "A Pod is Running once every one of its containers has started. Both of these are shell loops that never end, so a container that exits took a command the shell could not run — the quoting in the loops has to survive both YAML and the shell, and getting it wrong produces a container that starts and immediately finishes."
  exit 1
}
