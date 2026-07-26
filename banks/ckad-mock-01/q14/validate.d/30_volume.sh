#!/usr/bin/env bash
# points: 2
# desc: api-keys mounted read-only at /etc/api with defaultMode 0400
set -uo pipefail
src=$(kubectl -n tucana get deploy ledger-api \
  -o jsonpath='{.spec.template.spec.volumes[?(@.name=="api-keys")].secret.secretName}' 2>/dev/null)
[ "$src" = "api-keys" ] || { echo "volume 'api-keys' is not backed by Secret api-keys (got '$src')"; exit 1; }

# The API stores file modes as decimal, so 0400 comes back as 256. Both
# spellings are the same value and a candidate may legitimately have
# written either.
mode=$(kubectl -n tucana get deploy ledger-api \
  -o jsonpath='{.spec.template.spec.volumes[?(@.name=="api-keys")].secret.defaultMode}' 2>/dev/null)
[ "$mode" = "256" ] || { echo "defaultMode is '$mode', want 256 (0400)"; exit 1; }

path=$(kubectl -n tucana get deploy ledger-api \
  -o jsonpath='{.spec.template.spec.containers[0].volumeMounts[?(@.name=="api-keys")].mountPath}' 2>/dev/null)
ro=$(kubectl -n tucana get deploy ledger-api \
  -o jsonpath='{.spec.template.spec.containers[0].volumeMounts[?(@.name=="api-keys")].readOnly}' 2>/dev/null)
[ "$path" = "/etc/api" ] || { echo "mountPath is '$path', want /etc/api"; exit 1; }
[ "$ro" = "true" ] \
  && echo "secret volume ok" \
  || { echo "mount is not readOnly (got '$ro')"; exit 1; }
