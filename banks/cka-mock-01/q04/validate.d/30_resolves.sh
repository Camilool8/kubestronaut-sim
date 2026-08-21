#!/usr/bin/env bash
# points: 3
# desc: a Pod in cygnus resolves ledger.sim.internal through cluster DNS to the ledger ClusterIP
# expected: none — both criteria come from an nslookup run live from inside the
#           cluster (whether it answers at all, and whether the answer is the
#           ledger ClusterIP), a behavioural reading of the whole DNS path
#           rather than a document either side authored. The messages already
#           name the addresses seen.
set -uo pipefail
. /banks/_lib/checks.sh

probe=$(kubectl -n cygnus get deploy dns-probe -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ "${probe:-0}" -gt 0 ] 2>/dev/null || {
  echo "no ready Pod of Deployment dns-probe in cygnus to resolve from"
  show_actual text "$(kubectl -n cygnus get deploy 2>&1
                      echo
                      kubectl -n cygnus get pods 2>&1)"
  show_why "dns-probe is the Pod this task is verified from, and the one the question asks you to test with — it is seeded for you and is not part of what has to be repaired. With none of its Pods running there is nothing inside the cluster to ask, and cluster DNS cannot be judged from an instance shell: the instances are not cluster nodes and never use CoreDNS."
  exit 1
}

want=$(kubectl -n kube-system get deploy coredns -o jsonpath='{.spec.replicas}' 2>/dev/null)
ready=$(kubectl -n kube-system get deploy coredns -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
all_ready() {
  [ -n "${ready:-}" ] || return 1
  [ "${want:-0}" != "0" ] || return 1
  [ "$ready" = "$want" ]
}
all_ready || {
  echo "coredns has ${ready:-0} of ${want:-?} replicas ready"
  show_actual text "$(kubectl -n kube-system get deploy coredns 2>&1
                      echo
                      kubectl -n kube-system get pods -l k8s-app=kube-dns 2>&1)"
  show_why "CoreDNS refuses to start on a Corefile it cannot read, so replicas that do not come back after the edit mean the file is malformed — an unclosed brace in the stub block is the usual cause, and the Pod's logs say so in their first lines. Until every replica is serving again, part of the cluster has no DNS at all, which is a bigger outage than the one this task started with."
  exit 1
}

ledger_ip=$(kubectl -n cygnus get svc ledger -o jsonpath='{.spec.clusterIP}' 2>/dev/null)

out=$(kubectl -n cygnus exec deploy/dns-probe -- \
  sh -c 'for i in 1 2 3; do
           timeout 4 nslookup ledger.sim.internal && exit 0
           sleep 1
         done
         exit 1' 2>&1)
addrs=$(printf '%s\n' "$out" | awk '
  /^Name:/ { seen = 1 }
  seen { for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/) print $i }')

evidence() {
  show_actual text "$(printf 'nslookup ledger.sim.internal from dns-probe:\n%s\n' "$out")"
  show_why "$1"
}

crit 2 "cluster DNS answers for the zone" \
  "the lookup returned no address (got: $(printf '%s' "$out" | tr '\n' ' ' | head -c 200))" \
  "The failure shapes are worth telling apart: 'no such name' means the query reached the zone's nameserver and the name is not in it, while a wait followed by a server failure means the query never got an answer from wherever cluster DNS sent it. This lookup goes the whole way — Pod to CoreDNS, CoreDNS to the resolver, resolver to its zone — so it also passes as soon as it is asked of the resolver's address directly rather than through cluster DNS." \
  -- [ -n "$addrs" ]

crit 1 "it answers with the ledger Service address" \
  "ledger.sim.internal resolved to '$(printf '%s' "$addrs" | tr '\n' ' ')', want ${ledger_ip:-the ledger ClusterIP}" \
  "An answer that is not the ClusterIP of Service ledger means the query is being served from stale zone data: the path is repaired but what comes back down it still points at an address the Service no longer has, which fails in a far more confusing way than not resolving at all." \
  -- has_name "$addrs" "$ledger_ip"

crit_all_passed || evidence "$(crit_why)"
report "the internal zone resolves"
