#!/usr/bin/env bash
# points: 3
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

# "Newer than the one it started on" — seeded at 1.0.0, so anything above
# that counts. Compared as versions, not strings, so a future 1.10.0 does
# not lose to 1.9.0.
newest=$(printf '1.0.0\n%s\n' "$version" | sort -V | tail -1)
[ "$version" != "1.0.0" ] && [ "$newest" = "$version" ] || {
  echo "chart is '$chart'; it must be newer than sim-web-1.0.0"
  evidence "An upgrade re-renders the release from a chart version, and the release is still on the one it was installed with. The repo's own index is the authority on which versions exist — guessing a number that is not published just fails, and asking for no version at all takes the newest."
  exit 1
}
[ "$status" = "deployed" ] || {
  echo "release status is '$status', want deployed"
  evidence "The release exists but is not in the deployed state. An upgrade that fails leaves the release marked failed with the previous revision's objects still running, so the cluster can look completely healthy while Helm considers the release broken."
  exit 1
}
[ "$revision" -ge 2 ] 2>/dev/null && echo "upgraded to ${chart} (revision ${revision})" || {
  echo "revision is '$revision'; an upgrade should have produced at least 2"
  evidence "Every successful upgrade increments the release's revision, so revision 1 means nothing has been applied through Helm since it was installed. Changing the objects with kubectl instead moves the cluster without telling Helm, and the next upgrade renders the chart again and undoes it."
  exit 1
}
