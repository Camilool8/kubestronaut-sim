#!/usr/bin/env bash
# points: 3
# desc: the readinessProbe is an HTTP GET on / and targets port 8080
set -uo pipefail
. /banks/_lib/checks.sh

ns=orion
dep=telemetry-api

spec=$(kubectl -n "$ns" get deploy "$dep" -o json 2>/dev/null \
  | jq 'first(.spec.template.spec.containers[]? | select(.name == "api")) // empty')

evidence() {
  show_actual json "$(printf '%s' "${spec:-null}" \
    | jq '{ports: (.ports // null), readinessProbe: (.readinessProbe // null)}' 2>/dev/null)"
  show_why "$1"
}

[ -n "$spec" ] || {
  names=$(kubectl -n "$ns" get deploy "$dep" \
    -o jsonpath='{.spec.template.spec.containers[*].name}' 2>/dev/null)
  echo "no container named 'api' in deploy/$dep (found: $(name_list "$names"))"
  show_actual text "containers that exist: $(name_list "$names")"
  show_why "The probe this check grades belongs to the container named api in the Pod template of Deployment telemetry-api, Namespace orion. 'none' above means no such Deployment exists in that Namespace at all; any other name means the container was renamed, which this question never asked for."
  exit 1
}

probe=$(printf '%s' "$spec" | jq '.readinessProbe // empty')
[ -n "$probe" ] || {
  echo "container 'api' has no readinessProbe"
  evidence "Deleting the probe does turn the Pods green, and that is exactly why it is not the fix: with no readiness gate at all a Pod is put into service the instant its process starts, including the seconds before it can answer anything. The question asks for the probe to be repaired and kept, so a template with none scores nothing here — add it back as an HTTP GET on / against the port the container serves."
  exit 1
}

kind=$(printf '%s' "$probe" | jq -r '
  if .httpGet then "httpGet"
  elif .tcpSocket then "tcpSocket"
  elif .exec then "exec"
  elif .grpc then "grpc"
  else "none" end')
path=$(printf '%s' "$probe" | jq -r '.httpGet.path // ""')

# A probe may name its port instead of numbering it, and `port: http` here is
# every bit as correct as `port: 8080` — so resolve a name through the
# container's own ports before comparing. Grading the spelling would fail the
# better answer of the two.
port=$(printf '%s' "$spec" | jq -r '
  (.readinessProbe.httpGet.port // .readinessProbe.tcpSocket.port
   // .readinessProbe.grpc.port // empty) as $p
  | if ($p | type) == "number" then ($p | tostring)
    else ((first(.ports[]? | select(.name == $p) | .containerPort) // $p) | tostring)
    end')

# The probe must still be the HTTP GET on / that it was seeded as — a gate
# rather than a criterion, because the seeded probe already satisfies it and a
# criterion the untouched environment passes is a point awarded for no work.
[ "$kind" = httpGet ] && [ "$path" = "/" ] || {
  echo "the readinessProbe is a '$kind' probe on path '$path', want an httpGet on /"
  evidence "The question asks for this probe to be repaired rather than replaced, and only its port was ever wrong. A tcpSocket probe passes as soon as the port accepts a connection, which says nothing about whether the application can serve a request, and an exec probe grades something else entirely — so swapping the probe's type is not a repair, and this check scores nothing for it."
  exit 1
}

crit 3 "the probe targets the port the container serves on" \
  "the readinessProbe targets port '$port', want 8080 (or the name the container gives it)" \
  "The container listens on 8080 — that is what the mounted configuration tells nginx to do, and the containerPort beside it records the same number. A probe sent anywhere else is answered by nothing, so it fails forever while the container itself is perfectly healthy: no restarts, no crash, nothing in the logs, and a Deployment that never becomes Available. Naming the port rather than numbering it is accepted, since the name resolves to the same 8080." \
  -- [ "$port" = "8080" ]

crit_all_passed || evidence "$(crit_why)"
report "probe ok"
