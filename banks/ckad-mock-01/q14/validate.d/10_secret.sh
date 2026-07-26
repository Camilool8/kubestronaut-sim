#!/usr/bin/env bash
# points: 2
# desc: Secret api-keys holds apikey and apisecret
set -uo pipefail
key=$(kubectl -n tucana get secret api-keys -o jsonpath='{.data.apikey}' 2>/dev/null | base64 -d 2>/dev/null)
sec=$(kubectl -n tucana get secret api-keys -o jsonpath='{.data.apisecret}' 2>/dev/null | base64 -d 2>/dev/null)
[ "$key" = "vega-7731" ] || { echo "apikey is '$key', want vega-7731"; exit 1; }
[ "$sec" = "RvT2-88x" ] \
  && echo "secret ok" \
  || { echo "apisecret is '$sec', want RvT2-88x"; exit 1; }
