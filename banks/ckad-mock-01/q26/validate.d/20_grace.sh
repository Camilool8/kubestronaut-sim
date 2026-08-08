#!/usr/bin/env bash
# points: 3
# desc: the Pod template asks for a 45 second termination grace period
set -uo pipefail
. /banks/_lib/checks.sh

got=$(kubectl -n volans get deploy edge-cache \
  -o jsonpath='{.spec.template.spec.terminationGracePeriodSeconds}' 2>/dev/null)
[ "$got" = "45" ] && { echo "grace period ok"; exit 0; }

echo "terminationGracePeriodSeconds is '$got', want 45"
show_actual json "$(kubectl -n volans get deploy edge-cache -o json 2>/dev/null \
  | jq '{terminationGracePeriodSeconds: .spec.template.spec.terminationGracePeriodSeconds,
         containers: [.spec.template.spec.containers[] | {name, image, imagePullPolicy}]}')"
show_expected json "/banks/${BANK:-ckad-mock-01}/q26/expected/podspec.json"
show_why "terminationGracePeriodSeconds belongs to the POD, not to a container — the opposite of imagePullPolicy, which is why the two together are worth knowing. It is the whole budget from SIGTERM to SIGKILL, shared by every container in the Pod, and it starts at the same moment the endpoint is removed from the Service. Unset it defaults to 30, which is what an untouched Deployment reads."
exit 1
