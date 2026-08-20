#!/usr/bin/env bash
set -euo pipefail

NS=sagitta

# 1. The denominator. `set resources` merges key by key, so the memory request
# and limit the container already carries survive it.
kubectl -n "$NS" set resources deploy payments-api \
  --containers=api --requests=cpu=100m

# The rollout is what puts the request on real Pods; the second criterion reads
# the Pods' own spec, so it has to have happened before grading.
kubectl -n "$NS" rollout status deploy/payments-api --timeout=180s

# 2. The autoscaler. autoscaling/v2 is not a preference: the scale-down
# stabilization window has no field in v1 to be written into.
kubectl apply -f - <<EOF
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: payments-api
  namespace: ${NS}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: payments-api
  minReplicas: 2
  maxReplicas: 6
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 60
EOF

# Read it back through the version the grader reads, so a conversion surprise
# would fail here rather than as a lost point.
hpa=$(kubectl -n "$NS" get horizontalpodautoscalers.v2.autoscaling payments-api -o json)

want() { # label, jq filter
  printf '%s' "$hpa" | jq -e "$2" >/dev/null || {
    echo "q20: $1" >&2
    printf '%s' "$hpa" | jq .spec >&2
    exit 1
  }
}

want 'scaleTargetRef is not Deployment/payments-api' \
  '.spec.scaleTargetRef | (.kind == "Deployment") and (.name == "payments-api")'
want 'the replica range is not 2..6' \
  '(.spec.minReplicas == 2) and (.spec.maxReplicas == 6)'
want 'no Resource metric targeting 50% cpu utilization' \
  '[.spec.metrics[]? | select(.type == "Resource") | .resource
    | select(.name == "cpu") | select(.target.type == "Utilization")
    | .target.averageUtilization] | any(. == 50)'
want 'scaleDown stabilization is not 60s' \
  '.spec.behavior.scaleDown.stabilizationWindowSeconds == 60'

cpu=$(kubectl -n "$NS" get deploy payments-api \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].resources.requests.cpu}')
[ -n "$cpu" ] || {
  echo "q20: the api container still declares no CPU request" >&2
  kubectl -n "$NS" get deploy payments-api \
    -o jsonpath='{.spec.template.spec.containers[*].resources}{"\n"}' >&2
  exit 1
}

n=$(kubectl -n "$NS" get pod -l app=payments-api -o json \
  | jq '[.items[] | select(.metadata.deletionTimestamp == null)
         | .spec.containers[] | select(.name == "api")
         | .resources.requests.cpu | select(. != null)] | length')
[ "${n:-0}" -ge 1 ] || {
  echo "q20: no running Pod carries a CPU request on its api container" >&2
  kubectl -n "$NS" get pod -l app=payments-api >&2
  exit 1
}
