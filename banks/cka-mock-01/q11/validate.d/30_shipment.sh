#!/usr/bin/env bash
# points: 2
# desc: Shipment atlas-7 in pyxis carries the consignment's destination, weight and service level, and the carrier it was booked with
# expected: shipment.json json
set -uo pipefail
. /banks/_lib/checks.sh

NS=pyxis

cr=$(kubectl -n "$NS" get shipment atlas-7 -o json 2>/dev/null)

# The schema has exactly these fields under spec — nothing to project away.
snapshot() {
  printf '%s' "${cr:-null}" | jq -S '.spec // null' 2>/dev/null
}

evidence() {
  show_pair json shipment.json
  show_why "$1"
}

[ -n "$cr" ] || {
  echo "no Shipment named atlas-7 in $NS"
  show_actual text "$(kubectl -n "$NS" get shipments 2>&1)"
  show_why "A custom resource is created the same way any other object is, with apiVersion logistics.sim.dev/v1alpha1 and kind Shipment; the CRD is what taught the API server to accept it. Nothing of that name is here — a Shipment is namespaced, so one in another Namespace is a different object and this lookup will not find it. An error in the pane above instead of a listing means the API server no longer serves the resource at all."
  exit 1
}

dest=$(printf '%s' "$cr" | jq -r '.spec.destination // ""')
weight=$(printf '%s' "$cr" | jq -r '.spec.weightKg // ""')
priority=$(printf '%s' "$cr" | jq -r '.spec.priority // ""')
carrier=$(printf '%s' "$cr" | jq -r '.spec.carrier.name // ""')
contract=$(printf '%s' "$cr" | jq -r '.spec.carrier.contract // ""')

# jq compares 1200 against the number, not the string: weightKg is declared an
# integer, so a quoted value never reaches the object at all - the API server
# rejects it on the way in.
booked_load() {
  printf '%s' "$cr" \
    | jq -e '.spec.destination == "rotterdam-north" and .spec.weightKg == 1200
             and .spec.priority == "express"' >/dev/null 2>&1
}
booked_carrier() {
  printf '%s' "$cr" \
    | jq -e '.spec.carrier.name == "blue-line"
             and .spec.carrier.contract == "LOG-2291"' >/dev/null 2>&1
}

# The consignment and the booking are graded apart because they fail apart: the
# flat fields are the ones a schema will argue with, and the carrier is the one
# whose shape has to be discovered.
crit 1 "records the consignment itself" \
  "destination='$dest', weightKg='$weight', priority='$priority'; want rotterdam-north, 1200 and express" \
  "These three are the load: where it goes, what it weighs and what it was booked at. weightKg is declared an integer, so 1200 goes in unquoted — quote it and the API server refuses the object rather than storing the string. priority is an enumeration with a default of standard, which is what the field holds when it is left out entirely: a Shipment that never mentions priority still comes back with one, and it is not the express this consignment was booked at." \
  -- booked_load

crit 1 "and the carrier it was booked with" \
  "carrier.name='$carrier', carrier.contract='$contract'; want blue-line and LOG-2291" \
  "The carrier is an object inside spec rather than two more fields beside destination, which is why the question does not spell the layout out and kubectl explain shipment.spec.carrier does. Written flat, as a carrier string or a contract of its own at the top of spec, the values do not merely land in the wrong place: a structural schema prunes fields it does not know about, so they are dropped on the way in and the object comes back without them." \
  -- booked_carrier

crit_all_passed || evidence "$(crit_why)"
report "atlas-7: ${weight}kg to ${dest}, ${priority}, with ${carrier}"
