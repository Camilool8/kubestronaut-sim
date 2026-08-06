#!/usr/bin/env bash
set -euo pipefail

have=$(kubectl -n perseus get pod ledger-api -o json \
  | jq -r '.spec.ephemeralContainers // [] | map(select(.name == "debugger")) | length')
if [ "$have" = "0" ]; then

  kubectl -n perseus debug ledger-api \
    --image=busybox:1.37 -c debugger --target=api --profile=general -- sleep 3600
fi

state=""
for _ in $(seq 1 40); do
  state=$(kubectl -n perseus get pod ledger-api -o json \
    | jq -r '.status.ephemeralContainerStatuses // [] | map(select(.name == "debugger")) | first | .state | keys[0]? // ""')
  if [ "$state" = "running" ]; then
    break
  fi
  sleep 3
done
if [ "$state" != "running" ]; then
  echo "the debugger container never started (state '${state}')" >&2
  exit 1
fi

kubectl -n perseus exec ledger-api -c debugger -- \
  wget -q -O - http://127.0.0.1:8080/healthz > /opt/course/25/healthz
kubectl -n perseus exec ledger-api -c debugger -- ps > /opt/course/25/api-process
