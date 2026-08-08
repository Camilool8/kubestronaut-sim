#!/usr/bin/env bash
# points: 2
# desc: report-api-v2 was upgraded to a newer sim-web chart and is deployed
set -uo pipefail
. /banks/_lib/checks.sh
export HELM_NAMESPACE=carina
evidence() {
  show_actual text "$(helm ls -a 2>/dev/null; echo; helm search repo sim/sim-web --versions 2>/dev/null)"
  show_why "$1"
}

info=$(helm ls -o json 2>/dev/null | jq -r '.[] | select(.name == "report-api-v2") | "\(.chart)|\(.status)|\(.revision)"')
[ -n "$info" ] || {
  echo "report-api-v2 is not installed"
  evidence "report-api-v2 is not in the release list at all. An upgrade is not a reinstall: it keeps the release's name and history and moves it to a new chart version, so uninstalling this one loses the very thing the task is about. The second table is every version of the chart the repo holds."
  exit 1
}

chart=${info%%|*}
rest=${info#*|}
status=${rest%%|*}
revision=${rest##*|}
version=${chart#sim-web-}

newest=$(printf '1.0.0\n%s\n' "$version" | sort -V | tail -1)
moved_on()  { [ "$version" != "1.0.0" ] && [ "$newest" = "$version" ]; }
revised()   { [ "$revision" -ge 2 ] 2>/dev/null; }

# 'deployed' is the state report-api-v2 was seeded in, so on its own it grades
# nothing. It says something once an upgrade has been through the release: a
# failed upgrade records a new revision and leaves the release marked failed.
upgrade_deployed() { revised && [ "$status" = "deployed" ]; }

crit 2 "on a chart newer than sim-web-1.0.0" \
  "chart is '$chart'; it must be newer than sim-web-1.0.0" \
  "An upgrade re-renders the release from a chart version, and the release is still on the one it was installed with. The repo's own index is the authority on which versions exist — guessing a number that is not published just fails, and asking for no version at all takes the newest." \
  -- moved_on

crit 1 "the upgrade left the release deployed, not failed" \
  "release is at revision '$revision' with status '$status'; an upgrade that lands leaves it deployed at revision 2 or later" \
  "No successful upgrade has been through this release. It was installed deployed and revision 1 means nothing has been applied since, so the status alone proves nothing here. An upgrade that fails records a new revision and marks the release failed with the previous revision's objects still running, so the cluster can look completely healthy while Helm considers the release broken." \
  -- upgrade_deployed

crit 1 "the upgrade went through Helm" \
  "revision is '$revision'; an upgrade should have produced at least 2" \
  "Every successful upgrade increments the release's revision, so revision 1 means nothing has been applied through Helm since it was installed. Changing the objects with kubectl instead moves the cluster without telling Helm, and the next upgrade renders the chart again and undoes it." \
  -- revised

crit_all_passed || evidence "$(crit_why)"
report "upgraded to ${chart} (revision ${revision})"
