#!/usr/bin/env bash
# points: 2
# desc: /opt/course/29/crd-name holds the fully-qualified CRD name
set -uo pipefail
. /banks/_lib/checks.sh

f=/opt/course/29/crd-name
want=featuretoggles.flags.kubestronaut.dev
got=$(file_text "$f")
[ -n "$got" ] || {
  echo "$f is missing or empty"
  show_why "Nothing was written to that path. The name is on the cluster, and listing CustomResourceDefinitions prints it directly — it is not something to reconstruct from the kind."
  exit 1
}
[ "$got" = "$want" ] && echo "crd name recorded" || {
  echo "$f holds '$got', want $want"
  show_actual text "$(cat "$f" 2>/dev/null)"
  show_why "A CustomResourceDefinition's own name is not free-form: the API server requires it to be the resource's plural joined to its API group by a dot, which is why it is the one string that identifies the definition unambiguously. The kind on its own, or the plural on its own, names neither the object nor the API path."
  exit 1
}
