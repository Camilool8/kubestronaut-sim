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
crit 1 "holds apikey=vega-7731" \
  "apikey is '$key', want vega-7731" \
  "Each literal becomes one entry in the Secret's data map, and the KEY names it — apikey and apisecret are key names, not the values stored under them. The API base64-encodes what you give it and returns it encoded, which is why the pane above shows only key names. An empty pane means no Secret called api-keys exists in tucana." \
  -- [ "$key" = "vega-7731" ]

crit 1 "holds apisecret=RvT2-88x" \
  "apisecret is '$sec', want RvT2-88x" \
  "The second entry is missing or holds something else. A generic Secret is just a set of key/value pairs — creating it from literals encodes them for you, while writing the manifest by hand means either encoding them yourself under data or using stringData and letting the API do it." \
  -- [ "$sec" = "RvT2-88x" ]

crit_all_passed || evidence "$(crit_why)"
report "secret ok"
