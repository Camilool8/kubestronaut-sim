#!/usr/bin/env bash
# points: 5
# desc: payments-api is Available and its container really reads the endpoint from the ConfigMap
set -uo pipefail
. /banks/_lib/checks.sh

want=postgres.lyra.svc.cluster.local:5432

evidence() {
  show_actual text "$(kubectl -n lyra get deploy payments-api 2>/dev/null; echo; \
    kubectl -n lyra get pod 2>/dev/null)"
  show_why "$1"
}

deploys=$(kubectl -n lyra get deploy -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)
has_name "$deploys" payments-api || {
  echo "no Deployment named payments-api in lyra (found: $(name_list "$deploys"))"
  show_actual text "$(kubectl -n lyra get deploy,cm 2>/dev/null)"
  show_why "The Deployment the question named is the one that is graded. Repairing this one was the task; a replacement created under another name leaves payments-api either broken or gone, and nothing here can score it."
  exit 1
}

desired=$(kubectl -n lyra get deploy payments-api -o jsonpath='{.spec.replicas}' 2>/dev/null)
ready=$(kubectl -n lyra get deploy payments-api -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
available=$(kubectl -n lyra get deploy payments-api \
  -o jsonpath='{.status.conditions[?(@.type=="Available")].status}' 2>/dev/null)

# A container that exits keeps its Pod out of Ready, so a Deployment reporting
# every replica ready AND Available is a converged answer rather than a
# snapshot of one lucky moment. Restart counts are deliberately not read: they
# survive nothing — a restart of the environment resets them, and a correct
# answer would then be indistinguishable from one that had never crashed.
settled() {
  [ -n "$ready" ] && [ -n "$desired" ] || return 1
  [ "$ready" -ge 1 ] 2>/dev/null || return 1
  [ "$ready" = "$desired" ] && [ "$available" = "True" ]
}

crit 2 "payments-api is Available with every replica ready" \
  "readyReplicas='$ready' of spec.replicas='$desired', Available='$available'" \
  "A Deployment counts a replica ready only while its container is up, so a container that starts and exits never gets there however many times it is restarted. Available on top of that means the ready count has held, which is the difference between a Pod that is briefly up between crashes and one that is actually running. If the endpoint is right and this is still short, look for a second problem in the Pod template — or for replicas set to zero, which is not a fixed application." \
  -- settled

# What the process ACTUALLY received, which is the only thing that proves the
# reference resolves: a template can name a real ConfigMap key and still hand
# the container the wrong string, and the container is where the value matters.
seen=$(timeout 20 kubectl -n lyra --request-timeout=15s exec deploy/payments-api \
  -- printenv DB_ENDPOINT 2>/dev/null | tr -d '\r\n')

crit 3 "the container reads DB_ENDPOINT=$want from the ConfigMap" \
  "the container sees DB_ENDPOINT='$seen', want '$want'" \
  "This reads the variable inside the running container, so it answers the question the Pod template only promises: does the reference resolve, and to the value the ConfigMap holds. Empty means either that no container is running to ask — the variable is still unset and the process is still refusing to start — or that the variable is not defined for the container at all. A different value means the endpoint was retyped rather than taken from payments-config, and the ConfigMap's own value was not to be changed." \
  -- [ "$seen" = "$want" ]

crit_all_passed || evidence "$(crit_why)"
report "payments-api is up on the ConfigMap's endpoint"
