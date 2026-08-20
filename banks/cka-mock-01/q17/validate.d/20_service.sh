#!/usr/bin/env bash
# points: 2
# desc: Service pollux-web is a NodePort on 30081 whose targetPort names the container port
set -uo pipefail
. /banks/_lib/checks.sh

svc=$(kubectl -n gemini get svc pollux-web -o json 2>/dev/null)

[ -n "$svc" ] || {
  echo "no Service named pollux-web in namespace gemini"
  show_actual text "$(kubectl -n gemini get svc 2>/dev/null)"
  show_why "The Service is the object this question asks you to create, and it does not exist under that name in gemini. A Service is not created for you by exposing a Deployment's containerPort — a containerPort documents what the container listens on and opens nothing."
  exit 1
}

type=$(printf '%s' "$svc" | jq -r '.spec.type // ""')
np=$(printf '%s' "$svc" | jq -r \
  '[.spec.ports[]? | select(.port == 80) | .nodePort // empty | tostring] | join(" ")')
target=$(printf '%s' "$svc" | jq -r \
  '[.spec.ports[]? | select(.port == 80) | (.targetPort // "") | tostring] | join(" ")')

evidence() {
  show_actual json "$(printf '%s' "$svc" | jq '{type: .spec.type, selector: .spec.selector, ports: .spec.ports}')"
  show_why "$1"
}

crit 1 "type NodePort" \
  "type is '$type', want NodePort" \
  "A NodePort Service is a ClusterIP Service PLUS a port opened on every node: the cluster IP keeps working exactly as before, and the node port is additional. The type field is what opens it, and nothing else does — a ClusterIP Service answering perfectly on its cluster address proves nothing about a node port." \
  -- [ "$type" = "NodePort" ]

crit 1 "node port pinned to 30081" \
  "nodePort for port 80 is '$np', want 30081" \
  "Omit nodePort and the cluster allocates one at random out of its node-port range, which is normally what you want; pinning it is for when something outside the cluster has the number written down, as here. The field belongs to the same ports entry as port 80 — a Service's ports is a list, and port, targetPort and nodePort travel together in one entry." \
  -- [ "$np" = "30081" ]

crit 2 "targetPort references the container port by name" \
  "targetPort for port 80 is '$target', want the name http-web" \
  "targetPort takes either a number or the name of a port declared in the Pod's containers[].ports, and this question asks for the name. The number would work identically today; the name is what keeps working when the application moves to another port, because it follows the container and the Service never needs editing. That is the whole trade, and it is why 8080 here is not the answer even though traffic still arrives." \
  -- [ "$target" = "http-web" ]

crit_all_passed || evidence "$(crit_why)"
report "nodeport service ok"
