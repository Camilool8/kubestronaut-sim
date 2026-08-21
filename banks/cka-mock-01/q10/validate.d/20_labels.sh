#!/usr/bin/env bash
# points: 3
# desc: env=prod labels the live Deployment, the Service and the running Pods
# expected: labels.json json
set -uo pipefail
. /banks/_lib/checks.sh

dep=$(kubectl -n scutum get deploy helios-web -o jsonpath='{.metadata.labels.env}' 2>/dev/null)
svc=$(kubectl -n scutum get svc helios-web -o jsonpath='{.metadata.labels.env}' 2>/dev/null)
tmpl=$(kubectl -n scutum get deploy helios-web \
  -o jsonpath='{.spec.template.metadata.labels.env}' 2>/dev/null)
running=$(kubectl -n scutum get pod -l app=helios-web,env=prod -o json 2>/dev/null \
  | jq '[.items[] | select(.status.phase == "Running")] | length' 2>/dev/null)

# The label transformer's own output — what it wrote onto the Deployment, the
# Service and the Pod template. The count of Pods actually Running from that
# template is a live reading and rides on its own crit message instead.
snapshot() {
  jq -nS --arg dep "${dep:-}" --arg svc "${svc:-}" --arg tmpl "${tmpl:-}" '
    { deployment: (if $dep == "" then null else $dep end),
      service: (if $svc == "" then null else $svc end),
      podTemplate: (if $tmpl == "" then null else $tmpl end) }
  ' 2>/dev/null
}

evidence() {
  show_pair json labels.json
  show_why "$1"
}

kubectl -n scutum get deploy helios-web >/dev/null 2>&1 || {
  echo "no Deployment helios-web in namespace scutum to carry a label"
  show_actual text "$(kubectl -n scutum get deploy,svc 2>/dev/null)"
  show_why "There is nothing in the Namespace for a label transformer to have labelled. Building the overlay renders the objects; applying it is what creates them."
  exit 1
}

# The Pods are not resources in the build — the Deployment makes them from its
# template — so both halves have to hold: the template carries the pair, and
# Pods really running from that template carry it too. Counted, never named:
# a Pod's name is the ReplicaSet's to choose and changes under every restart.
pods_carry_it() {
  [ "$tmpl" = "prod" ] && [ -n "$running" ] && [ "$running" -ge 1 ] 2>/dev/null
}

crit 1 "the Deployment object carries env=prod" \
  "the Deployment's env label is '$dep', want prod" \
  "A label transformer writes its pairs into the metadata of every resource the build renders, so the Deployment object itself is the first place the pair should appear. Absent here, either no transformer was added or the overlay was rendered but never applied." \
  -- [ "$dep" = "prod" ]

crit 1 "the Service carries it too" \
  "the Service's env label is '$svc', want prod (empty also means no Service helios-web in scutum)" \
  "The pair goes on EVERY resource in the build, not only the Deployment — the base ships a Service as well, so applying the overlay creates and labels both. A Service that is missing or unlabelled usually means the manifests were applied by hand instead of through the kustomization." \
  -- [ "$svc" = "prod" ]

crit 1 "and so do the Pods" \
  "the Pod template's env label is '$tmpl' and ${running:-0} running Pods carry app=helios-web,env=prod" \
  "Labelling the Deployment does not label its Pods: those are created later from spec.template, so the pair reaches them only when the transformer is told to descend into the template as well as the object's own metadata. The switch that also writes it into spec.selector.matchLabels achieves this too — at the price of an immutable field, which makes every later apply against an existing Deployment fail." \
  -- pods_carry_it

crit_all_passed || evidence "$(crit_why)"
report "env=prod on the objects and the Pods"
