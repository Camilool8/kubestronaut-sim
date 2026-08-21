#!/usr/bin/env bash
# points: 3
# desc: Pod no-token gets no ServiceAccount token mounted at all
# expected: automount.json json
set -uo pipefail
. /banks/_lib/checks.sh

auto=$(kubectl -n phoenix get pod no-token \
  -o jsonpath='{.spec.automountServiceAccountToken}' 2>/dev/null)
phase=$(kubectl -n phoenix get pod no-token -o jsonpath='{.status.phase}' 2>/dev/null)

# Only automountServiceAccountToken is a shape the candidate set on the Pod
# spec. Whether a token is actually projected into the running container, and
# whether the Pod is Running at all, are live readings and ride on their own
# crit messages below instead of a second pane.
snapshot() {
  jq -nS --arg auto "${auto:-}" '{automountServiceAccountToken: (if $auto == "" then null else $auto end)}' 2>/dev/null
}

evidence() {
  show_pair json automount.json
  show_why "$1"
}

token_present() {
  kubectl -n phoenix exec no-token -c web -- \
    test -e /var/run/secrets/kubernetes.io/serviceaccount 2>/dev/null
}

# Only an absence observed inside a running container counts. exec into a Pod
# that does not exist fails too, and a bare negate would read that as a pass.
no_token_mounted() {
  [ "$phase" = "Running" ] || return 1
  negate token_present
}

crit 1 "automountServiceAccountToken is false" \
  "automountServiceAccountToken is '$auto', want false" \
  "automountServiceAccountToken: false is what stops the kubelet projecting a token volume into the container at all. The field exists on both the Pod and the ServiceAccount and the POD's setting wins — setting it on the account is the better default when nothing using it needs API access, setting it on the Pod is the targeted version the question asks for." \
  -- [ "$auto" = "false" ]

crit 1 "nothing is mounted at the token path inside the container" \
  "a token is still mounted inside the container, or there is no running container to look inside" \
  "What is declared and what is projected are different things. A projected volume added by hand mounts a token at that path regardless of the automount setting, and the question asks for nothing to be there at all — which is why this is verified from inside the container rather than from the spec. An absence only counts when there is a running container to observe it in." \
  -- no_token_mounted

crit 1 "the Pod is Running" \
  "pod phase is '$phase', want Running" \
  "A Pod that never starts proves nothing about what would have been mounted into it, so the absence of a token only counts while the Pod is actually up." \
  -- [ "$phase" = "Running" ]

crit_all_passed || evidence "$(crit_why)"
report "no token mounted"
