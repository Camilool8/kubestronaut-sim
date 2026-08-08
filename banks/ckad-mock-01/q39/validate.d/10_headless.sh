#!/usr/bin/env bash
# points: 3
# desc: Service shard is headless, selects app=shard and publishes port 80
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual yaml "$(kubectl -n telescopium get svc shard -o yaml 2>/dev/null | k8s_clean)"
  show_why "$1"
}

kubectl -n telescopium get svc shard >/dev/null 2>&1 || {
  echo "no Service named shard in Namespace telescopium"
  show_actual text "$(kubectl -n telescopium get svc 2>/dev/null)"
  show_why "The StatefulSet names shard as its governing Service and nothing by that name exists. Its Pods run regardless — a StatefulSet does not wait for the Service — but neither the set's own name nor any per-Pod name resolves until the Service is there."
  exit 1
}

cip=$(kubectl -n telescopium get svc shard -o jsonpath='{.spec.clusterIP}' 2>/dev/null)
sel=$(kubectl -n telescopium get svc shard -o json 2>/dev/null \
  | jq -r '.spec.selector // {} | to_entries | map("\(.key)=\(.value)") | sort | join(",")')
target=$(kubectl -n telescopium get svc shard \
  -o jsonpath='{.spec.ports[?(@.port==80)].targetPort}' 2>/dev/null)

crit 2 "no cluster IP is allocated" \
  "clusterIP is '$cip', want None" \
  "clusterIP: None is the whole of 'headless', and the value is the literal string None rather than an empty one — omit the field and the API allocates an address as usual. With no virtual address there is nothing for kube-proxy to program, so the name resolves to the Pod addresses themselves instead of to one address in front of them, and it is that shape which lets the cluster's DNS publish a name per Pod. The type still reads ClusterIP; headless is not a fourth Service type." \
  -- [ "$cip" = "None" ]

crit 1 "selects the StatefulSet's Pods" \
  "selector is '$sel', want app=shard" \
  "A Service finds its Pods by label, never by name and never through the StatefulSet that owns them. Naming the set in spec.serviceName does not connect the two — the Service's own selector does, and while it matches nothing the name resolves to nothing at all." \
  -- [ "$sel" = "app=shard" ]

crit 1 "publishes port 80" \
  "targetPort for port 80 is '$target', want 80" \
  "A headless Service still declares its ports: they describe the endpoints and they are what its SRV records answer with. Nothing is renumbered for a direct connection to a Pod address, but a Service that publishes no port 80 does not publish the port the question asked for." \
  -- [ "$target" = "80" ]

crit_all_passed || evidence "$(crit_why)"
report "headless service ok"
