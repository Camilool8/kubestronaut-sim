#!/usr/bin/env bash
# points: 2
# desc: the ambassador holds the config, and the app knows nothing about the backend
set -uo pipefail
src=$(kubectl -n dorado get pod checkout \
  -o jsonpath='{.spec.volumes[?(@.name=="conf")].configMap.name}' 2>/dev/null)
[ "$src" = "ambassador-conf" ] || { echo "volume 'conf' is not backed by ambassador-conf (got '$src')"; exit 1; }

path=$(kubectl -n dorado get pod checkout \
  -o jsonpath='{.spec.containers[?(@.name=="ambassador")].volumeMounts[?(@.name=="conf")].mountPath}' 2>/dev/null)
[ "$path" = "/etc/nginx/conf.d" ] || { echo "ambassador mounts conf at '$path', want /etc/nginx/conf.d"; exit 1; }

# The pattern's actual promise: the application is ignorant of the
# backend. Passing the Service name to the app as an env var, or mounting
# the proxy config into it, would still make the wget below succeed while
# defeating the entire point.
appspec=$(kubectl -n dorado get pod checkout -o json 2>/dev/null \
  | jq -r '.spec.containers[] | select(.name == "app")')
printf '%s' "$appspec" | grep -q 'payments-backend' \
  && { echo "the app container references payments-backend; only the ambassador may know about it"; exit 1; }
echo "wiring ok"
