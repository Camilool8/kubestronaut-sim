#!/usr/bin/env bash
set -euo pipefail

# The name goes on the Pod template first: a Service's targetPort can only
# refer to a name that already exists. Named container, so the strategic merge
# lands on the right one; containerPort is the merge key inside ports.
kubectl -n gemini patch deploy pollux-web --type=strategic -p '{
  "spec": {"template": {"spec": {"containers": [{
    "name": "web",
    "ports": [{"name": "http-web", "containerPort": 8080, "protocol": "TCP"}]
  }]}}}
}'
kubectl -n gemini rollout status deploy/pollux-web --timeout=180s

kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: pollux-web
  namespace: gemini
spec:
  type: NodePort
  selector:
    app: pollux-web
  ports:
    - port: 80
      targetPort: http-web
      nodePort: 30081
      protocol: TCP
EOF

# The endpoint list is written by a controller, so it lags the apply — and it
# is where the name becomes the number. Poll it rather than sleeping a guess.
ports=""
for _ in $(seq 1 20); do
  ports=$(kubectl -n gemini get endpointslice -l kubernetes.io/service-name=pollux-web -o json \
    | jq -r '[.items[]?.ports[]?.port | tostring] | unique | join(" ")') || ports=""
  [ "$ports" = "8080" ] && break
  sleep 3
done
[ "$ports" = "8080" ] || {
  echo "the endpoint list publishes '$ports', want 8080 — the named targetPort did not resolve" >&2
  kubectl -n gemini get endpointslice -l kubernetes.io/service-name=pollux-web >&2 || true
  exit 1
}

node=$(kubectl get nodes -o json | jq -r \
  '[.items[]? | select(any(.status.conditions[]?; .type == "Ready" and .status == "True"))
     | .status.addresses[]? | select(.type == "InternalIP") | .address] | first // empty')
[ -n "$node" ] || { echo "no Ready node reports an InternalIP" >&2; exit 1; }

# Captured rather than piped: grep -q leaves a pipeline early, and under
# pipefail a SIGPIPE'd kubectl would fail this script on a working answer.
out=$(kubectl -n gemini exec deploy/pollux-web -- \
  sh -c "for i in 1 2 3 4 5; do
           curl -s -m 5 http://${node}:30081/ && exit 0
           sleep 3
         done; exit 1" 2>/dev/null) || true
printf '%s' "$out" | grep -q 'pollux-ok' || {
  echo "nothing answered on ${node}:30081 (got: $out)" >&2
  kubectl -n gemini get svc pollux-web >&2 || true
  exit 1
}
