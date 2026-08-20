#!/usr/bin/env bash
# points: 3
# desc: the sim-dns resolver serves ledger.sim.internal as the ledger Service ClusterIP
set -uo pipefail
. /banks/_lib/checks.sh

zone=$(kubectl -n cygnus get cm sim-dns -o jsonpath='{.data.Corefile}' 2>/dev/null)
ledger_ip=$(kubectl -n cygnus get svc ledger -o jsonpath='{.spec.clusterIP}' 2>/dev/null)
resolver_ip=$(kubectl -n cygnus get svc sim-dns -o jsonpath='{.spec.clusterIP}' 2>/dev/null)

evidence() {
  show_actual text "$(printf 'ConfigMap cygnus/sim-dns, key Corefile:\n%s\n\nasking the resolver directly:\n%s\n' \
                        "${zone:-$ARTIFACT_EMPTY}" "${answer:-(not asked)}")"
  show_why "$1"
}

[ -n "$zone" ] || {
  echo "ConfigMap cygnus/sim-dns holds no Corefile"
  evidence "sim-dns is a CoreDNS of its own, and the zone it is authoritative for is the Corefile in this ConfigMap — the Deployment mounts it as a file. With the key gone the resolver has no zone to serve at all, so forwarding to it correctly still resolves nothing."
  exit 1
}

# The record as the zone declares it: the address written on the line that names
# ledger.sim.internal.
record=$(printf '%s\n' "$zone" | awk '
  /(^|[[:space:]])ledger\.sim\.internal(\.)?([[:space:]]|$)/ {
    for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/) print $i
  }')

answer=''
if [ -n "$resolver_ip" ]; then
  answer=$(kubectl -n cygnus exec deploy/dns-probe -- \
    sh -c "for i in 1 2; do
             timeout 4 nslookup ledger.sim.internal ${resolver_ip} && exit 0
             sleep 1
           done
           exit 1" 2>&1)
fi
served=$(printf '%s\n' "$answer" | awk '
  /^Name:/ { seen = 1 }
  seen { for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/) print $i }')

crit 1 "the zone maps ledger.sim.internal to the ledger Service" \
  "the zone answers ledger.sim.internal with '$(printf '%s' "$record" | tr '\n' ' ')', want ${ledger_ip:-the ledger ClusterIP}" \
  "A Service's ClusterIP is assigned when the Service is created, so a zone that was written against an earlier one now points at an address nothing owns. The current value is in the API — kubectl get svc ledger prints it — and it is stable for as long as the Service exists, which is what makes it safe to write into a zone at all." \
  -- has_name "$(printf '%s' "$record" | tr '\n' ' ')" "$ledger_ip"

crit 2 "the resolver itself now answers with that address" \
  "asking sim-dns directly returned '$(printf '%s' "$served" | tr '\n' ' ')', want ${ledger_ip:-the ledger ClusterIP}" \
  "Editing the ConfigMap is not the same as the resolver serving it: CoreDNS holds the zone it read at startup until the changed file reaches it, which a restart of the Deployment does at once. Querying the resolver's own address — nslookup takes the server as a second argument — is how to tell the two apart, and it answers whether or not cluster DNS is forwarding to it yet." \
  -- has_name "$(printf '%s' "$served" | tr '\n' ' ')" "$ledger_ip"

crit_all_passed || evidence "$(crit_why)"
report "zone data ok"
