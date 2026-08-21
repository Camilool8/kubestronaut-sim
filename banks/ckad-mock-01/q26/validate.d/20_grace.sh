#!/usr/bin/env bash
# points: 3
# desc: the Pod template asks for a 45 second termination grace period
# expected: podspec.json json
set -uo pipefail
. /banks/_lib/checks.sh

# Shared with 10_pull-policy.sh — see that check for why the containers array
# is sorted and why the two checks point at the same document.
snapshot() {
  kubectl -n volans get deploy edge-cache -o json 2>/dev/null \
    | jq -S '{
        terminationGracePeriodSeconds: .spec.template.spec.terminationGracePeriodSeconds,
        containers: ([.spec.template.spec.containers[]? | {name, imagePullPolicy}] | sort_by(.name))
      }' 2>/dev/null
}

evidence() {
  show_pair json podspec.json
  show_why "$1"
}

got=$(kubectl -n volans get deploy edge-cache \
  -o jsonpath='{.spec.template.spec.terminationGracePeriodSeconds}' 2>/dev/null)
[ "$got" = "45" ] && { echo "grace period ok"; exit 0; }

echo "terminationGracePeriodSeconds is '$got', want 45"
evidence "terminationGracePeriodSeconds belongs to the POD, not to a container — the opposite of imagePullPolicy, which is why the two together are worth knowing. It is the whole budget from SIGTERM to SIGKILL, shared by every container in the Pod, and it starts at the same moment the endpoint is removed from the Service. Unset it defaults to 30, which is what an untouched Deployment reads."
exit 1
