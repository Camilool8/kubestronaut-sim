#!/usr/bin/env bash
# points: 3
# desc: requests 100m/64Mi and limits 500m/128Mi
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual json "$(kubectl -n cygnus get pod vault-agent -o json 2>/dev/null | jq --arg c agent '
    if any(.spec.containers[]; .name == $c)
    then first(.spec.containers[] | select(.name == $c)) | .resources
    else {"no such container": $c, "containers that exist": [.spec.containers[].name]}
    end')"
  show_why "$1"
}

names=$(kubectl -n cygnus get pod vault-agent -o jsonpath='{.spec.containers[*].name}' 2>/dev/null)
has_name "$names" agent || {
  echo "pod vault-agent has no container named 'agent' (found: $(name_list "$names"))"
  evidence "Requests and limits are per container, and they are read off the container the question names. Set on a container under another name they are real, but not on the one being graded, so every quantity below reads back empty."
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
[ "$(milli "$rc")" = "100" ] || {
  echo "cpu request is '$rc', want 100m"
  evidence "A request is what the SCHEDULER reserves on a node — it decides where the Pod fits and is guaranteed to the container. A limit is the ceiling the kernel enforces. They are separate keys under resources and this one is requests.cpu. Quantities are compared by value, so 100m and 0.1 are the same answer."
  exit 1
}
[ "$(milli "$lc")" = "500" ] || {
  echo "cpu limit is '$lc', want 500m"
  evidence "limits.cpu is a throttle rather than a kill: a container over its CPU limit is slowed down, never terminated. Set a limit with no request and Kubernetes copies the limit into the request, which reserves far more of the node than intended — which is why the question names both."
  exit 1
}
[ "$(mib "$rm")" = "64" ] || {
  echo "memory request is '$rm', want 64Mi"
  evidence "requests.memory is the amount reserved for scheduling. Memory behaves nothing like CPU here: it cannot be throttled, so a container over its memory LIMIT is killed with OOMKilled and restarted. Mi is mebibytes; M would be a decimal megabyte and a different number."
  exit 1
}
[ "$(mib "$lm")" = "128" ] || {
  echo "memory limit is '$lm', want 128Mi"
  evidence "limits.memory is the hard ceiling the kernel enforces by killing the container. Requests and limits together also decide the Pod's QoS class, which is what the kubelet uses to choose whom to evict when a node runs short."
  exit 1
}
echo "resources ok"
