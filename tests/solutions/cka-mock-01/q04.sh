#!/usr/bin/env bash
set -euo pipefail

resolver=$(kubectl -n cygnus get svc sim-dns -o jsonpath='{.spec.clusterIP}')
[ -n "$resolver" ] || { echo "svc sim-dns has no ClusterIP" >&2; exit 1; }
ledger=$(kubectl -n cygnus get svc ledger -o jsonpath='{.spec.clusterIP}')
[ -n "$ledger" ] || { echo "svc ledger has no ClusterIP" >&2; exit 1; }

# 1. point the sim.internal stub at the resolver, touching nothing else
current=$(kubectl -n kube-system get cm coredns -o jsonpath='{.data.Corefile}')
fixed=$(printf '%s\n' "$current" | sed "s/10\.255\.255\.254/${resolver}/")
kubectl -n kube-system patch cm coredns --type=merge \
  -p "$(jq -n --arg c "$fixed" '{data: {Corefile: $c}}')"

live=$(kubectl -n kube-system get cm coredns -o jsonpath='{.data.Corefile}')
case " $(printf '%s' "$live" | tr -s '[:space:]' ' ') " in
  *" $resolver "*) ;;
  *) echo "the Corefile does not forward sim.internal to $resolver" >&2; exit 1 ;;
esac

kubectl -n kube-system rollout restart deploy coredns
kubectl -n kube-system rollout status deploy coredns --timeout=180s

# 2. give the resolver the address svc/ledger actually has
zone="sim.internal:5300 {
    errors
    hosts {
        ${ledger} ledger.sim.internal
        ttl 30
    }
    reload 10s
}"
kubectl -n cygnus patch cm sim-dns --type=merge \
  -p "$(jq -n --arg c "$zone" '{data: {Corefile: $c}}')"
kubectl -n cygnus rollout restart deploy sim-dns
kubectl -n cygnus rollout status deploy sim-dns --timeout=180s

# 3. wait for the whole path to converge on that answer
resolved() { # nameserver-argument (may be empty for cluster DNS)
  local out addrs
  out=$(kubectl -n cygnus exec deploy/dns-probe -- \
    sh -c "timeout 4 nslookup ledger.sim.internal $1" 2>&1 || true)
  addrs=$(printf '%s\n' "$out" | awk '
    /^Name:/ { seen = 1 }
    seen { for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/) print $i }')
  case " $(printf '%s' "$addrs" | tr '\n' ' ') " in
    *" $ledger "*) return 0 ;;
  esac
  return 1
}

ok=''
for _ in $(seq 1 20); do
  if resolved "$resolver" && resolved ""; then ok=1; break; fi
  sleep 3
done

[ -n "$ok" ] || {
  echo "ledger.sim.internal never resolved to $ledger" >&2
  kubectl -n cygnus exec deploy/dns-probe -- nslookup ledger.sim.internal >&2 || true
  exit 1
}
