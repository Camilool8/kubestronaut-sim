#!/usr/bin/env bash
# points: 3
# desc: Pod no-token gets no ServiceAccount token mounted at all
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual json "$(kubectl -n phoenix get pod no-token -o json 2>/dev/null | jq '{automountServiceAccountToken: .spec.automountServiceAccountToken, serviceAccountName: .spec.serviceAccountName, volumes: .spec.volumes, phase: .status.phase}')"
  show_why "$1"
}

auto=$(kubectl -n phoenix get pod no-token \
  -o jsonpath='{.spec.automountServiceAccountToken}' 2>/dev/null)
[ "$auto" = "false" ] || {
  echo "automountServiceAccountToken is '$auto', want false"
  evidence "automountServiceAccountToken: false is what stops the kubelet projecting a token volume into the container at all. The field exists on both the Pod and the ServiceAccount and the POD's setting wins — setting it on the account is the better default when nothing using it needs API access, setting it on the Pod is the targeted version the question asks for."
  exit 1
}

if kubectl -n phoenix exec no-token -c web -- \
     test -e /var/run/secrets/kubernetes.io/serviceaccount 2>/dev/null; then
  echo "a token is still mounted inside the container"
  evidence "What is declared and what is projected are different things. A projected volume added by hand mounts a token at that path regardless of the automount setting, and the question asks for nothing to be there at all — which is why this is verified from inside the container rather than from the spec."
  exit 1
fi
phase=$(kubectl -n phoenix get pod no-token -o jsonpath='{.status.phase}' 2>/dev/null)
[ "$phase" = "Running" ] && echo "no token mounted" || {
  echo "pod phase is '$phase', want Running"
  evidence "No token is mounted, but the Pod is not Running either — and a Pod that never starts proves nothing about what would have been mounted into it."
  exit 1
}
