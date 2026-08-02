#!/usr/bin/env bash
# points: 2
# desc: Secret api-keys holds apikey and apisecret
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual json "$(kubectl -n tucana get secret api-keys -o json 2>/dev/null | jq '{type, keys: (.data // {} | keys)}')"
  show_why "$1"
}

key=$(kubectl -n tucana get secret api-keys -o jsonpath='{.data.apikey}' 2>/dev/null | base64 -d 2>/dev/null)
sec=$(kubectl -n tucana get secret api-keys -o jsonpath='{.data.apisecret}' 2>/dev/null | base64 -d 2>/dev/null)
[ "$key" = "vega-7731" ] || {
  echo "apikey is '$key', want vega-7731"
  evidence "Each literal becomes one entry in the Secret's data map, and the KEY names it — apikey and apisecret are key names, not the values stored under them. The API base64-encodes what you give it and returns it encoded, which is why the values above are shown only as their key names. An empty pane means no Secret called api-keys exists in tucana."
  exit 1
}
[ "$sec" = "RvT2-88x" ] && echo "secret ok" || {
  echo "apisecret is '$sec', want RvT2-88x"
  evidence "The second entry is missing or holds something else. A generic Secret is just a set of key/value pairs — creating it from literals encodes them for you, while writing the manifest by hand means either encoding them yourself under data or using stringData and letting the API do it."
  exit 1
}
