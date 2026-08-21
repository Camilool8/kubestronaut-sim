#!/usr/bin/env bash
# points: 4
# desc: the kube-system Corefile forwards sim.internal to the sim-dns resolver, default block untouched
# expected: corefile.txt text
set -uo pipefail
. /banks/_lib/checks.sh

DEAD_IP=10.255.255.254

corefile=$(kubectl -n kube-system get cm coredns -o jsonpath='{.data.Corefile}' 2>/dev/null)

[ -n "$corefile" ] || {
  echo "kube-system/coredns holds no Corefile"
  show_actual text "$corefile"
  show_why "Cluster DNS is configured by the Corefile stored in the ConfigMap coredns in kube-system: CoreDNS mounts it from there, so that ConfigMap is the file. An empty pane means the ConfigMap, or its Corefile key, is gone entirely — and with it the default server block every Pod in the cluster resolves Service names through."
  exit 1
}

# The stub block, and everything that is not the stub block. Braces nest, so the
# split counts them rather than stopping at the first closing brace. The braces
# in the regexes are escaped on purpose: a bare /{/ is a repetition count to
# some awks — busybox's, which is the one the seed for this question runs
# under — and the same expression that works here dies there.
zone_block=$(printf '%s\n' "$corefile" | awk '
  skip == 0 && $1 ~ /^sim\.internal(:[0-9]+)?$/ { skip = 1; depth = 0 }
  skip == 1 {
    n = gsub(/\{/, "{"); m = gsub(/\}/, "}")
    depth += n - m
    print
    if (depth <= 0 && (n + m) > 0) skip = 2
    next
  }')
rest=$(printf '%s\n' "$corefile" | awk '
  skip == 0 && $1 ~ /^sim\.internal(:[0-9]+)?$/ { skip = 1; depth = 0 }
  skip == 1 {
    n = gsub(/\{/, "{"); m = gsub(/\}/, "}")
    depth += n - m
    if (depth <= 0 && (n + m) > 0) skip = 0
    next
  }
  { print }')

printf '%s\n' "$rest" | grep -q 'kubernetes[[:space:]][[:space:]]*cluster\.local' || {
  echo "no server block outside the sim.internal stub serves cluster.local any more"
  show_actual text "$corefile"
  show_why "Only the sim.internal block belongs to this task. The default block — the one whose kubernetes plugin answers every name under svc.cluster.local — belongs to the whole cluster, so rewriting the file around the stub instead of editing the stub inside it takes Service discovery away from every Pod in every Namespace. That is why this scores nothing even when the internal zone works."
  exit 1
}

[ -n "$zone_block" ] || {
  echo "the Corefile has no server block for sim.internal"
  show_actual text "$corefile"
  show_why "A stub domain is its own server block, headed by the zone name, and only that block decides where queries for names under it go. Deleting the block does not make the zone resolve: it makes CoreDNS treat sim.internal as an ordinary external name and hand it to the upstream nameserver in the default block, which has never heard of the zone."
  exit 1
}

snapshot() {
  printf '%s' "${zone_block:-}"
}

evidence() {
  show_pair text corefile.txt
  show_why "$1"
}

# Tokens of the stub block with any :port suffix removed, so 10.0.0.1 and
# 10.0.0.1:53 read as the same upstream.
tokens=$(printf '%s\n' "$zone_block" | tr -s '[:space:]' '\n' | sed 's/:[0-9]*$//' | tr '\n' ' ')
resolver_ip=$(kubectl -n cygnus get svc sim-dns -o jsonpath='{.spec.clusterIP}' 2>/dev/null)

crit 3 "the stub forwards to the sim-dns resolver" \
  "the stub block does not name the ClusterIP of Service sim-dns ('${resolver_ip:-none}'); it holds: $tokens" \
  "The forward plugin takes the address of the nameserver that owns the zone, and the nameserver for sim.internal is the Service sim-dns in Namespace cygnus — so the value belongs to that Service and is read from the API rather than remembered. A Service name cannot be used here: this IS the resolver, so nothing would be able to resolve it." \
  -- has_name "$tokens" "$resolver_ip"

crit 1 "the address that answers nothing is gone" \
  "the stub block still names ${DEAD_IP}" \
  "Nothing listens on ${DEAD_IP}, so a query sent there waits for a timeout and comes back as a server failure rather than as 'no such name'. Left beside a correct upstream it is worse than obvious breakage: forward spreads queries over every address it is given, so the zone would resolve for some lookups and fail for others." \
  -- negate has_name "$tokens" "$DEAD_IP"

crit_all_passed || evidence "$(crit_why)"
report "Corefile ok"
