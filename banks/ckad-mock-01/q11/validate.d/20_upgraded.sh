#!/usr/bin/env bash
# points: 3
# desc: report-api-v2 was upgraded to a newer sim-web chart and is deployed
set -uo pipefail
export HELM_NAMESPACE=carina
info=$(helm ls -o json 2>/dev/null | jq -r '.[] | select(.name == "report-api-v2") | "\(.chart)|\(.status)|\(.revision)"')
[ -n "$info" ] || { echo "report-api-v2 is not installed"; exit 1; }

chart=${info%%|*}
rest=${info#*|}
status=${rest%%|*}
revision=${rest##*|}
version=${chart#sim-web-}

# "Newer than the one it started on" — seeded at 1.0.0, so anything above
# that counts. Compared as versions, not strings, so a future 1.10.0 does
# not lose to 1.9.0.
newest=$(printf '1.0.0\n%s\n' "$version" | sort -V | tail -1)
[ "$version" != "1.0.0" ] && [ "$newest" = "$version" ] \
  || { echo "chart is '$chart'; it must be newer than sim-web-1.0.0"; exit 1; }
[ "$status" = "deployed" ] || { echo "release status is '$status', want deployed"; exit 1; }
[ "$revision" -ge 2 ] 2>/dev/null \
  && echo "upgraded to ${chart} (revision ${revision})" \
  || { echo "revision is '$revision'; an upgrade should have produced at least 2"; exit 1; }
