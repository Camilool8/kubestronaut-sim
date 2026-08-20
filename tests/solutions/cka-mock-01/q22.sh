#!/usr/bin/env bash
set -euo pipefail

NS=reticulum
DEP=checkout-api
PC=q22-critical
VALUE=500000
CEILING=1000000000

# The question asks for a value above the two seeded classes and the grader
# compares against what the API holds, not against a literal. Read them here
# too, so a retuned seed fails loudly in this script rather than as a lost point
# on a real attempt.
max=$(kubectl get priorityclass -o json \
  | jq '[.items[] | select(.metadata.name == "q22-bulk" or .metadata.name == "q22-standard")
         | .value] | max // -1')

[ "${max:-}" != -1 ] || {
  echo "q22: neither q22-bulk nor q22-standard is in the cluster — setup.sh did not run" >&2
  kubectl get priorityclass >&2
  exit 1
}
[ "$VALUE" -gt "$max" ] && [ "$VALUE" -le "$CEILING" ] || {
  echo "q22: $VALUE is not above the seeded classes (highest is $max) or is over the ceiling" >&2
  exit 1
}

# value is immutable, so a class left behind by an earlier run under this name
# has to go rather than be applied over.
kubectl delete priorityclass "$PC" --ignore-not-found

kubectl apply -f - <<EOF
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: ${PC}
value: ${VALUE}
globalDefault: false
preemptionPolicy: Never
description: "Checkout tier. Scheduled ahead of q22-standard, never preempts."
EOF

# Strategy first and the class second in the same patch: with maxUnavailable 0
# the promotion costs no serving capacity, which is the point of doing them
# together. A merge patch over spec.strategy.rollingUpdate replaces only the two
# keys named here.
kubectl -n "$NS" patch deploy "$DEP" --type=merge -p '{
  "spec": {
    "strategy": {"type": "RollingUpdate",
                 "rollingUpdate": {"maxSurge": 2, "maxUnavailable": 0}},
    "template": {"spec": {"priorityClassName": "q22-critical"}}}}'

kubectl -n "$NS" rollout status "deploy/$DEP" --timeout=180s

dep=$(kubectl -n "$NS" get deploy "$DEP" -o json)
pc=$(kubectl get priorityclass "$PC" -o json)

want() { # label, json, jq filter
  printf '%s' "$2" | jq -e "$3" >/dev/null || {
    echo "q22: $1" >&2
    printf '%s' "$2" | jq 'del(.metadata.managedFields, .status)' >&2
    exit 1
  }
}

want "$PC does not outrank the seeded classes or is over the ceiling" "$pc" \
  "(.value > $max) and (.value <= $CEILING)"
want "$PC still preempts" "$pc" '.preemptionPolicy == "Never"'
want "$PC is the cluster's global default" "$pc" '(.globalDefault // false) == false'
want "the Pod template does not name $PC" "$dep" \
  '.spec.template.spec.priorityClassName == "q22-critical"'
want "maxSurge is not 2" "$dep" '.spec.strategy.rollingUpdate.maxSurge == 2'
want "maxUnavailable is not 0" "$dep" '.spec.strategy.rollingUpdate.maxUnavailable == 0'

# The Pods have to have been REPLACED, so wait for the running set to carry the
# resolved priority rather than trusting rollout status alone.
replicas=$(printf '%s' "$dep" | jq -r '.spec.replicas // 1')
ok=''
for _ in $(seq 1 40); do
  pods=$(kubectl -n "$NS" get pod -l app="$DEP" -o json)
  here=$(printf '%s' "$pods" | jq --arg pc "$PC" --argjson v "$VALUE" '
    [ .items[] | select(.metadata.deletionTimestamp == null)
      | select(.spec.priorityClassName == $pc) | select(.spec.priority == $v) ] | length')
  away=$(printf '%s' "$pods" | jq --arg pc "$PC" --argjson v "$VALUE" '
    [ .items[] | select(.metadata.deletionTimestamp == null)
      | select(.spec.priorityClassName != $pc or .spec.priority != $v) ] | length')
  if [ "$here" -ge "$replicas" ] && [ "$away" -eq 0 ]; then ok=1; break; fi
  sleep 3
done

[ -n "$ok" ] || {
  echo "q22: the running Pods do not all carry $PC at priority $VALUE" >&2
  kubectl -n "$NS" get pod -o custom-columns=NAME:.metadata.name,CLASS:.spec.priorityClassName,PRIORITY:.spec.priority >&2
  exit 1
}
