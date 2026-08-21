#!/usr/bin/env bash
# points: 3
# desc: requests 100m/64Mi and limits 500m/128Mi
# expected: resources.json json
set -uo pipefail
. /banks/_lib/checks.sh

names=$(kubectl -n cygnus get pod vault-agent -o jsonpath='{.spec.containers[*].name}' 2>/dev/null)
has_name "$names" agent || {
  echo "pod vault-agent has no container named 'agent' (found: $(name_list "$names"))"
  show_actual text "containers that exist: $(name_list "$names")"
  show_why "Requests and limits are per container, and they are read off the container the question names. Set on a container under another name they are real, but not on the one being graded, so every quantity below reads back empty."
  exit 1
}

sel='{.spec.containers[?(@.name=="agent")].resources'
rc=$(kubectl -n cygnus get pod vault-agent -o jsonpath="${sel}.requests.cpu}" 2>/dev/null)
rm=$(kubectl -n cygnus get pod vault-agent -o jsonpath="${sel}.requests.memory}" 2>/dev/null)
lc=$(kubectl -n cygnus get pod vault-agent -o jsonpath="${sel}.limits.cpu}" 2>/dev/null)
lm=$(kubectl -n cygnus get pod vault-agent -o jsonpath="${sel}.limits.memory}" 2>/dev/null)

milli() {
  case "$1" in
    *m) printf '%s' "${1%m}" ;;
    "") printf '' ;;
    *) awk -v v="$1" 'BEGIN{printf "%d", v * 1000}' ;;
  esac
}
mib() {
  case "$1" in
    *Mi) printf '%s' "${1%Mi}" ;;
    *Gi) awk -v v="${1%Gi}" 'BEGIN{printf "%d", v * 1024}' ;;
    "") printf '' ;;
    *) printf 'x' ;;
  esac
}

snapshot() {
  jq -n -S \
    --arg rc "${rc:-}" --arg rm "${rm:-}" --arg lc "${lc:-}" --arg lm "${lm:-}" \
    '{
      requests: {cpu: (if $rc == "" then null else $rc end), memory: (if $rm == "" then null else $rm end)},
      limits: {cpu: (if $lc == "" then null else $lc end), memory: (if $lm == "" then null else $lm end)}
    }' 2>/dev/null
}

evidence() {
  show_pair json resources.json
  show_why "$1"
}

crit 1 "requests 100m CPU"    "cpu request is '$rc', want 100m"     -- [ "$(milli "$rc")" = "100" ]
crit 1 "limited to 500m CPU"  "cpu limit is '$lc', want 500m"       -- [ "$(milli "$lc")" = "500" ]
crit 1 "requests 64Mi memory" "memory request is '$rm', want 64Mi"  -- [ "$(mib "$rm")" = "64" ]
crit 1 "limited to 128Mi memory" "memory limit is '$lm', want 128Mi" -- [ "$(mib "$lm")" = "128" ]

crit_all_passed || evidence "A request is what the SCHEDULER reserves on a node; a limit is the ceiling the kernel enforces. They are separate keys under resources and quantities are compared by value, so 100m and 0.1 are the same answer. The two resources behave differently at the limit: a container over its CPU limit is throttled and never terminated, while one over its memory limit is killed with OOMKilled and restarted. Set a limit with no request and Kubernetes copies the limit into the request, reserving far more of the node than intended — which is why the question names all four. Mi is mebibytes; M would be a decimal megabyte and a different number."
report "resources ok"
