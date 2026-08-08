#!/usr/bin/env bash
# points: 3
# desc: object-cache is a deployed sim-cache release carrying those values
set -uo pipefail
. /banks/_lib/checks.sh
export HELM_NAMESPACE=caelum
evidence() {
  show_actual text "$(helm ls -a 2>/dev/null; echo; helm get values object-cache 2>/dev/null)"
  show_why "$1"
}

info=$(helm ls -a -o json 2>/dev/null | jq -r '.[] | select(.name == "object-cache") | "\(.chart)|\(.status)"')
[ -n "$info" ] || {
  echo "there is no release named object-cache in namespace caelum"
  show_actual text "$(helm ls -a 2>/dev/null)"
  show_why "The release name is chosen at install time and is what every later helm command addresses; one chart backs as many releases as you like, each with its own values and its own history. Creating the Deployment with kubectl instead reaches similar objects that Helm does not know about and will never upgrade."
  exit 1
}

chart=${info%%|*}
status=${info##*|}
reps=$(helm get values object-cache -o json 2>/dev/null | jq -r '.replicaCount // empty')
tag=$(helm get values object-cache -o json 2>/dev/null | jq -r '.image.tag // empty')

from_sim_cache() { printf '%s' "$chart" | grep -q '^sim-cache-'; }
carries_values() { [ "$reps" = "3" ] && [ "$tag" = "1.27-alpine" ]; }

crit 1 "installed from sim/sim-cache" \
  "object-cache uses chart '$chart', want sim-cache" \
  "The chart supplies the templates and the defaults; the release name says nothing about which one was used. Installing the wrong chart under the right release name produces a release that looks correct in helm ls and renders something else entirely." \
  -- from_sim_cache

crit 1 "the release is deployed" \
  "release status is '$status', want deployed" \
  "A release that is not deployed did not finish. An install that fails leaves the record behind marked failed, with whatever objects it managed to create still in the cluster — helm ls hides it unless you ask for all releases." \
  -- [ "$status" = "deployed" ]

crit 1 "the overrides reached the release" \
  "the release was given replicaCount='$reps' and image.tag='$tag', want 3 and 1.27-alpine" \
  "This is what the release itself believes it was given, which is a different question from what the file says. A values file that was written but never passed on the command line leaves this empty and the release on the chart's defaults, and the difference does not show up until an upgrade re-renders the chart and reverts everything." \
  -- carries_values

crit_all_passed || evidence "$(crit_why)"
report "object-cache is a deployed ${chart} release with the file's values"
