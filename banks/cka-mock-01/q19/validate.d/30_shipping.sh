#!/usr/bin/env bash
# points: 3
# desc: the shipper sidecar runs and its own container log carries the app's lines
set -uo pipefail
. /banks/_lib/checks.sh

ns=volans
dep=orders-api
marker='orders-api seq='

states='[]'
logs=''
hits=0

# No Pod names anywhere in here. They are controller-generated and change on
# every rollout and on every `./sim down && up`, so the pane reports what the
# sidecar containers are DOING and lets the log excerpt speak for itself.
evidence() {
  show_actual text "$(printf 'shipper container states: %s\n\nlast lines of the shipper log:\n%s\n' \
    "${states:-[]}" "${logs:-<the shipper container produced no log output>}")"
  show_why "$1"
}

inits=$(kubectl -n "$ns" get deploy "$dep" \
  -o jsonpath='{.spec.template.spec.initContainers[*].name}' 2>/dev/null)
name=$(kubectl -n "$ns" get deploy "$dep" -o jsonpath='{.metadata.name}' 2>/dev/null)

[ -n "$name" ] || {
  echo "Deployment $dep not found in Namespace $ns"
  show_actual text "$(kubectl -n "$ns" get deploy 2>/dev/null)"
  show_why "This check reads the running Pods of Deployment orders-api in Namespace volans, and the pane above lists what that Namespace actually holds. Nothing outside that Deployment's Pod template is read here."
  exit 1
}

# Nothing to grade until the sidecar exists in the template, and 'not started'
# is not partial credit for shipping logs — so this is a gate.
has_name "$inits" shipper || {
  echo "no initContainers entry named 'shipper' in deploy/$dep (initContainers: $(name_list "$inits"))"
  show_actual text "initContainers that exist: $(name_list "$inits")"
  show_why "This check grades what the sidecar actually ships, which needs a sidecar to exist first. A native sidecar is an entry under .spec.initContainers carrying restartPolicy: Always; declared anywhere else, or not at all, there is no shipper container for 'kubectl logs -c shipper' to read and nothing here can be scored."
  exit 1
}

pods=$(kubectl -n "$ns" get pod -l app="$dep" -o json 2>/dev/null \
  | jq -r '.items[]? | select(.metadata.deletionTimestamp == null) | .metadata.name' 2>/dev/null)

states=$(kubectl -n "$ns" get pod -l app="$dep" -o json 2>/dev/null \
  | jq -c '[.items[]? | select(.metadata.deletionTimestamp == null)
            | .status.initContainerStatuses[]? | select(.name == "shipper")
            | {ready, state: (.state | keys)}]' 2>/dev/null)
running=$(printf '%s' "${states:-[]}" \
  | jq '[.[] | select(.state | index("running"))] | length' 2>/dev/null)
case ${running:-} in
  ''|*[!0-9]*) running=0 ;;
esac
sidecar_running() { [ "$running" -ge 1 ]; }

# Bounded three ways — at most three passes, at most two Pods per pass, and no
# new pass started after a 10-second deadline — so the worst case is about 14
# seconds even when every request runs into its own timeout, comfortably inside
# the grader's 30 s budget. The retry exists because a rollout that finished
# seconds before the grader ran leaves a sidecar that is correct and has not
# printed anything yet; the seeded app writes a line a second, so a single pass
# is all it ever needs in practice.
deadline=$((SECONDS + 10))
for _ in 1 2 3; do
  seen=0
  for p in $pods; do
    seen=$((seen + 1))
    [ "$seen" -le 2 ] || break
    out=$(kubectl -n "$ns" logs "$p" -c shipper --tail=40 --request-timeout=3s 2>/dev/null)
    [ -n "$out" ] || continue
    logs=$out
    hits=$(printf '%s\n' "$out" | grep -c "$marker")
    case ${hits:-} in
      ''|*[!0-9]*) hits=0 ;;
    esac
    [ "$hits" -ge 2 ] && break
  done
  [ "$hits" -ge 2 ] && break
  [ "$SECONDS" -lt "$deadline" ] || break
  sleep 2
done
ships_app_lines() { [ "$hits" -ge 2 ]; }

crit 1 "a shipper sidecar container is running" \
  "no Pod of $dep has a running container named shipper (running: $running)" \
  "A native sidecar is started by the kubelet before the application container and stays running alongside it, so a healthy Pod shows shipper in the running state for as long as the Pod lives. An entry under initContainers WITHOUT restartPolicy: Always is treated as an ordinary init container instead: the kubelet waits for it to exit, 'tail -F' never does, and the Pod sits in Init while nothing else starts." \
  -- sidecar_running

crit 2 "the shipper's own log carries the application's lines" \
  "the shipper container log holds ${hits} line(s) matching '${marker}', want at least 2" \
  "This is the only criterion here that grades behaviour rather than shape, and it is the one the question is really about: the application writes to a file and never to stdout, so its lines reach a container log only if the sidecar is tailing the same file the application is writing. An empty excerpt above means 'tail -F' is watching a path nothing appears at — most often because the emptyDir is mounted on only one of the two containers, or at a different path on each. -F retries forever instead of failing, so a sidecar in that state looks perfectly healthy and ships nothing at all." \
  -- ships_app_lines

crit_all_passed || evidence "$(crit_why)"
report "log shipping ok"
