#!/usr/bin/env bash
# points: 3
# desc: Service catalog in octans is an ExternalName alias for catalog.mensa.svc.cluster.local
# expected: service.yaml yaml
set -uo pipefail
. /banks/_lib/checks.sh

snapshot() {
  kubectl -n octans get svc catalog -o json 2>/dev/null | jq -S '
    {type: (.spec.type // null),
     externalName: ((.spec.externalName // null) | if type == "string" then rtrimstr(".") else . end)}' \
    | yq -p json -o yaml -P 2>/dev/null
}

evidence() {
  show_pair yaml service.yaml
  show_why "$1"
}

kubectl -n octans get svc catalog >/dev/null 2>&1 || {
  echo "no Service named catalog in Namespace octans"
  show_actual text "$(kubectl -n octans get svc 2>/dev/null)"
  show_why "The alias itself is missing, so nothing in octans answers to the name catalog at all. The Service the question asks for lives in octans beside the client, not in mensa beside the application — mensa's Service already exists and was not yours to change."
  exit 1
}

type=$(kubectl -n octans get svc catalog -o jsonpath='{.spec.type}' 2>/dev/null)
target=$(kubectl -n octans get svc catalog -o jsonpath='{.spec.externalName}' 2>/dev/null)
target=${target%.}

crit 1 "type ExternalName" \
  "type is '$type', want ExternalName" \
  "ExternalName is the one Service type with no selector, no endpoints and no cluster IP: it is answered entirely by DNS, as a CNAME record. Any other type makes spec.externalName inert — the field is stored and ignored, and the Service either selects Pods that do not exist here or has nothing to select at all." \
  -- [ "$type" = "ExternalName" ]

crit 2 "aimed at the catalog Service in mensa" \
  "externalName is '$target', want catalog.mensa.svc.cluster.local" \
  "externalName holds the name the alias resolves to, and it has to be the target's fully-qualified name. CoreDNS follows a CNAME on its own only while the target is inside the cluster zone, so catalog.mensa.svc.cluster.local is chased and answered while a short form such as catalog.mensa is handed upstream, where nothing has heard of it. The Pod's search list cannot rescue that: it expands what the client asked for, never a name the server returned." \
  -- [ "$target" = "catalog.mensa.svc.cluster.local" ]

crit_all_passed || evidence "$(crit_why)"
report "externalName alias ok"
