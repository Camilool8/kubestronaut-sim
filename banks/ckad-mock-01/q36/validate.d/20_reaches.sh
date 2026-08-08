#!/usr/bin/env bash
# points: 5
# desc: a Pod in octans really reaches the mensa catalog through the local name
set -uo pipefail
. /banks/_lib/checks.sh

out=$(kubectl -n octans exec deploy/shopfront -- \
  sh -c 'for i in 1 2 3; do
           curl -s -m 4 http://catalog/ && exit 0
           sleep 2
         done; exit 1' 2>/dev/null)

printf '%s' "$out" | grep -q 'catalog-mensa' && echo "the alias reaches mensa" || {
  echo "http://catalog/ answered '$(printf '%s' "$out" | tr '\n' ' ' | head -c 120)', want catalog-mensa"
  show_actual yaml "$(kubectl -n octans get svc catalog -o yaml 2>/dev/null | k8s_clean)"
  show_why "A Pod in octans asked for the name catalog and did not get mensa's application back. Resolution runs the Pod's search list first, so catalog becomes catalog.octans.svc.cluster.local — the alias — and CoreDNS answers that with a CNAME and then resolves the target itself. An empty answer is the alias missing, or aimed at a name the cluster's DNS does not serve, which is what a short target such as catalog.mensa produces. An answer that arrives but says something else means the name resolved to some other Service: an ExternalName carries no port mapping, so whatever port the client asks for is the port it gets on the target."
  exit 1
}
