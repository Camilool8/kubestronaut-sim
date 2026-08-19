#!/usr/bin/env bash
set -euo pipefail

NS=cygnus
DEAD_IP=10.255.255.254
STALE_IP=10.96.255.240

kubectl create ns "$NS" --dry-run=client -o yaml | kubectl apply -f -

# The zone server runs the CoreDNS image the cluster itself already runs: it is
# in every node's image store, so nothing is pulled at seed time.
dns_image=$(kubectl -n kube-system get deploy coredns \
  -o jsonpath='{.spec.template.spec.containers[0].image}')
[ -n "$dns_image" ] || { echo "q04: cannot read the cluster's CoreDNS image"; exit 1; }

# ---------------------------------------------------------------- the workload
# ledger is what the internal zone is supposed to point at, so a repaired name
# resolves to something the candidate can actually reach.
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ledger
  namespace: ${NS}
spec:
  replicas: 1
  selector:
    matchLabels: {app: ledger}
  template:
    metadata:
      labels: {app: ledger}
    spec:
      containers:
        - name: web
          image: nginx:1.29-alpine
          ports: [{containerPort: 80}]
---
apiVersion: v1
kind: Service
metadata:
  name: ledger
  namespace: ${NS}
spec:
  selector: {app: ledger}
  ports:
    - port: 80
      targetPort: 80
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dns-probe
  namespace: ${NS}
spec:
  replicas: 1
  selector:
    matchLabels: {app: dns-probe}
  template:
    metadata:
      labels: {app: dns-probe}
    spec:
      dnsConfig:
        options:
          - name: ndots
            value: "1"
      containers:
        - name: shell
          image: busybox:1.37
          command: ["sh", "-c", "while true; do sleep 3600; done"]
EOF

ledger_ip=$(kubectl -n "$NS" get svc ledger -o jsonpath='{.spec.clusterIP}')
[ -n "$ledger_ip" ] || { echo "q04: Service ledger has no ClusterIP"; exit 1; }
# The seeded zone record must be an address ledger does NOT have, or the second
# fault would not exist.
if [ "$STALE_IP" = "$ledger_ip" ]; then STALE_IP=10.96.255.241; fi

# ------------------------------------------------- the zone server, with stale
# data: it is authoritative for sim.internal and answers ledger.sim.internal
# with an address the Service no longer has. It listens on 5300, so the
# container needs no privileged port; its Service maps 53 onto that.
zone="sim.internal:5300 {
    errors
    hosts {
        ${STALE_IP} ledger.sim.internal
        ttl 30
    }
    reload 10s
}"

zone_live=$(kubectl -n "$NS" get cm sim-dns -o jsonpath='{.data.Corefile}' 2>/dev/null || true)
if [ "$zone_live" != "$zone" ]; then
  tmp=$(mktemp -d)
  printf '%s\n' "$zone" > "$tmp/Corefile"
  kubectl -n "$NS" create cm sim-dns --from-file=Corefile="$tmp/Corefile" \
    --dry-run=client -o yaml | kubectl apply -f -
  rm -rf "$tmp"
  if kubectl -n "$NS" get deploy sim-dns >/dev/null 2>&1; then
    kubectl -n "$NS" rollout restart deploy/sim-dns
  fi
fi

kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sim-dns
  namespace: ${NS}
spec:
  replicas: 1
  selector:
    matchLabels: {app: sim-dns}
  template:
    metadata:
      labels: {app: sim-dns}
    spec:
      containers:
        - name: coredns
          image: ${dns_image}
          args: ["-conf", "/etc/coredns/Corefile"]
          volumeMounts:
            - name: config
              mountPath: /etc/coredns
          ports:
            - {containerPort: 5300, protocol: UDP, name: dns-udp}
            - {containerPort: 5300, protocol: TCP, name: dns-tcp}
          readinessProbe:
            tcpSocket: {port: 5300}
            initialDelaySeconds: 2
            periodSeconds: 5
      volumes:
        - name: config
          configMap:
            name: sim-dns
            items: [{key: Corefile, path: Corefile}]
---
apiVersion: v1
kind: Service
metadata:
  name: sim-dns
  namespace: ${NS}
spec:
  selector: {app: sim-dns}
  ports:
    - name: dns-udp
      port: 53
      targetPort: 5300
      protocol: UDP
    - name: dns-tcp
      port: 53
      targetPort: 5300
      protocol: TCP
EOF

kubectl -n "$NS" rollout status deploy/ledger --timeout=180s
kubectl -n "$NS" rollout status deploy/dns-probe --timeout=180s
kubectl -n "$NS" rollout status deploy/sim-dns --timeout=180s

# ------------------------------------------------------------- the broken stub
# ONLY the sim.internal server block is ours. The default `.:53` block — the one
# every other question's DNS depends on — is copied through untouched, and a
# re-run replaces our block rather than appending a second one. No cache plugin
# in the stub: a repaired zone must answer correctly immediately, not after a
# TTL somewhere has expired.
strip_zone() {
  awk '
    skip == 0 && $1 ~ /^sim\.internal(:[0-9]+)?$/ { skip = 1; depth = 0 }
    skip == 1 {
      n = gsub(/{/, "{"); m = gsub(/}/, "}")
      depth += n - m
      if (depth <= 0 && (n + m) > 0) skip = 0
      next
    }
    { print }
  ' | awk '
    BEGIN { blank = 0 }
    {
      if ($0 ~ /^[[:space:]]*$/) { blank++ }
      else { while (blank-- > 0) print ""; blank = 0; print }
    }'
}

broken="sim.internal:53 {
    errors
    forward . ${DEAD_IP}
}"

current=$(kubectl -n kube-system get cm coredns -o jsonpath='{.data.Corefile}')
[ -n "$current" ] || { echo "q04: kube-system/coredns has no Corefile"; exit 1; }

want=$(printf '%s\n' "$current" | strip_zone)
want=$(printf '%s\n\n%s' "$want" "$broken")

if [ "$current" != "$want" ]; then
  kubectl -n kube-system patch cm coredns --type=merge \
    -p "$(jq -n --arg c "$want" '{data: {Corefile: $c}}')"
  # CoreDNS keeps two replicas and rolls one at a time, so the restart that
  # makes the broken stub live never takes cluster DNS down entirely.
  kubectl -n kube-system rollout restart deploy/coredns
  kubectl -n kube-system rollout status deploy/coredns --timeout=120s || true
fi
