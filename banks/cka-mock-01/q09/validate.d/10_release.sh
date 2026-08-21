#!/usr/bin/env bash
# points: 3
# desc: storefront is a deployed sim-web 1.1.0 release, upgraded into, still carrying both overrides
# expected: release.json json
set -uo pipefail
. /banks/_lib/checks.sh
export HELM_NAMESPACE=tucana

info=$(helm ls -a -o json 2>/dev/null \
  | jq -r '.[] | select(.name == "storefront") | "\(.chart)|\(.status)|\(.revision)"')

chart=${info%%|*}
rest=${info#*|}
status=${rest%%|*}
revision=${rest##*|}
reps=$(helm get values storefront -o json 2>/dev/null | jq -r '.replicaCount // empty')
port=$(helm get values storefront -o json 2>/dev/null | jq -r '.service.port // empty')

# Only chart and the two overrides are shapes the candidate chose — the chart
# version at upgrade time, replicaCount and service.port on the command line.
# revision/status is a lifecycle reading (did an upgrade happen and land) and
# rides on its own crit message below instead of a second pane.
snapshot() {
  jq -nS --arg chart "${chart:-}" --arg reps "${reps:-}" --arg port "${port:-}" '
    { chart: (if $chart == "" then null else $chart end),
      values: { replicaCount: (if $reps == "" then null else $reps end),
                service: { port: (if $port == "" then null else $port end) } } }
  ' 2>/dev/null
}

evidence() {
  show_pair json release.json
  show_why "$1"
}

[ -n "$info" ] || {
  echo "there is no release named storefront in namespace tucana"
  show_actual text "$(helm ls -a 2>/dev/null)"
  show_why "The release name is chosen at install time and is what every later helm command addresses; one chart backs as many releases as you like, each with its own values and its own history. Creating the Deployment and Service with kubectl instead reaches similar objects that Helm does not know about, cannot upgrade and cannot roll back. helm ls hides a release that failed, so this listing asks for all of them."
  exit 1
}

at_target_version() { [ "$chart" = "sim-web-1.1.0" ]; }

# 'deployed' on its own grades nothing here — a release is deployed the moment
# it installs. It says something once paired with the revision: an upgrade that
# fails still records a new revision and leaves the release marked failed with
# the previous revision's objects running.
upgraded_into() { [ "${revision:-0}" -ge 2 ] 2>/dev/null && [ "$status" = "deployed" ]; }

carries_overrides() { [ "$reps" = "3" ] && [ "$port" = "8080" ]; }

crit 1 "the release runs chart sim-web-1.1.0" \
  "storefront is on chart '$chart', want sim-web-1.1.0" \
  "The chart version is what the release was last rendered from, and the repo's index is the authority on which versions exist — asking for one that is not published fails, and asking for none at all takes the newest, which is only the right answer by accident. The listing above shows what this release is on." \
  -- at_target_version

crit 1 "it arrived there by upgrading the 1.0.0 release" \
  "storefront is at revision '$revision' with status '$status'; an install followed by an upgrade leaves it deployed at revision 2 or later" \
  "The task is a lifecycle, not an end state: install 1.0.0 first, then upgrade the same release. Every operation Helm applies increments the revision, so revision 1 means this release has only ever been installed once — installing 1.1.0 directly reaches the same objects with no history to roll back to. A revision of 2 or more with a status other than deployed means an operation went through and did not land." \
  -- upgraded_into

crit 1 "the overrides survived the upgrade" \
  "the release holds replicaCount='$reps' and service.port='$port', want 3 and 8080" \
  "This is what the release itself believes it was given. helm upgrade does not inherit the previous revision's values: it renders the new chart against the chart's own defaults plus whatever this command line passes, so an upgrade that omits the overrides succeeds and quietly puts the release back on one replica and port 80. Passing them again, or --reuse-values, is what keeps them." \
  -- carries_overrides

crit_all_passed || evidence "$(crit_why)"
report "storefront: ${chart}, revision ${revision}, ${status}"
