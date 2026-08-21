#!/usr/bin/env bash
# points: 2
# desc: Pod checkout runs app (busybox) and ambassador (nginx), and is Running
# expected: containers.json json
set -uo pipefail
. /banks/_lib/checks.sh

# The Pod phase criterion below is a behavioural reading (has every container
# started), not a shape either container was authored with, so it is left out
# of the pane and rides on its own crit message instead.
snapshot() {
  kubectl -n dorado get pod checkout -o json 2>/dev/null \
    | jq -S '{containers: ([.spec.containers[]? | {name, image}] | sort_by(.name))}' 2>/dev/null
}

evidence() {
  show_pair json containers.json
  show_why "$1"
}

names=$(kubectl -n dorado get pod checkout \
  -o jsonpath='{range .spec.containers[*]}{.name}{"\n"}{end}' 2>/dev/null | sort | tr '\n' ' ')
names=${names% }
app=$(kubectl -n dorado get pod checkout -o jsonpath='{.spec.containers[?(@.name=="app")].image}' 2>/dev/null)
amb=$(kubectl -n dorado get pod checkout -o jsonpath='{.spec.containers[?(@.name=="ambassador")].image}' 2>/dev/null)
phase=$(kubectl -n dorado get pod checkout -o jsonpath='{.status.phase}' 2>/dev/null)

crit 2 "one Pod holding both app and ambassador" \
  "containers are '$names', want 'app' and 'ambassador'" \
  "Both containers belong to the SAME Pod, and that is the mechanism the whole pattern depends on: containers in one Pod share a network namespace, so the app can reach the proxy on localhost. Split across two Pods there would be no loopback to share. An empty pane means no Pod called checkout exists in dorado." \
  -- [ "$names" = "ambassador app" ]

crit 1 "app runs busybox:1.37" \
  "app image is '$app', want busybox:1.37" \
  "The app is a stand-in for something you do not own and cannot change — that is the situation the pattern exists for — so it runs a plain image doing nothing but staying alive." \
  -- [ "$app" = "busybox:1.37" ]

crit 1 "ambassador runs nginx:1.29-alpine" \
  "ambassador image is '$amb', want nginx:1.29-alpine" \
  "The ambassador is the proxy, so it has to be an image that can act as one; the configuration it is given is written for nginx." \
  -- [ "$amb" = "nginx:1.29-alpine" ]

crit 1 "the Pod is Running" \
  "pod phase is '$phase', want Running" \
  "A Pod is Running once every container has started. The proxy is the one that usually fails here: nginx refuses to start on a configuration it cannot parse, and mounting a directory over the wrong path replaces its main configuration file rather than adding to it." \
  -- [ "$phase" = "Running" ]

crit_all_passed || evidence "$(crit_why)"
report "containers ok"
