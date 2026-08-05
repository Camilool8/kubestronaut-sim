#!/usr/bin/env bash
set -euo pipefail

# An ephemeral container can never be removed, so adding one that is
# already there fails. Re-running this script has to be a no-op on that
# step rather than an error.
have=$(kubectl -n perseus get pod ledger-api -o json \
  | jq -r '.spec.ephemeralContainers // [] | map(select(.name == "debugger")) | length')
if [ "$have" = "0" ]; then
  # --profile=general only silences kubectl's own deprecation notice
  # about the implicit `legacy` profile; neither profile changes what the
  # checks read (name, image, targetContainerName).
  kubectl -n perseus debug ledger-api \
    --image=busybox:1.37 -c debugger --target=api --profile=general -- sleep 3600
fi

# The container is in the spec immediately; the kubelet still has to
# start it, and an exec that arrives first fails with "container not
# found". Wait on the status the API reports rather than a guessed sleep.
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
