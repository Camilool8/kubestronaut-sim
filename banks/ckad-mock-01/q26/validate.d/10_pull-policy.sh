#!/usr/bin/env bash
# points: 4
# desc: both containers declare imagePullPolicy Never in the Deployment's Pod template
# expected: podspec.json json
set -uo pipefail
. /banks/_lib/checks.sh

# Shared with 20_grace.sh: both checks grade fields of the same edited Pod
# template, so they document it once. imagePullPolicy is read back by name in
# both checks, never by position, so the containers array is sorted here too —
# a template that is otherwise correct but lists refresher before cache must
# not read as a diff.
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

# Both containers were pre-seeded under these names, so one going missing means
# the workload itself was altered rather than configured.
present=$(kubectl -n volans get deploy edge-cache \
  -o jsonpath='{.spec.template.spec.containers[*].name}' 2>/dev/null)
for c in cache refresher; do
  has_name "$present" "$c" || {
    echo "the Deployment has no container named ${c} (found: $(name_list "$present"))"
    show_actual text "containers that exist: $(name_list "$present")"
    show_why "The two containers are the workload as it stands. Renaming or removing one answers a different question, and the pull policy still has to be set on whatever is left."
    exit 1
  }
done

for c in cache refresher; do
  got=$(kubectl -n volans get deploy edge-cache \
    -o jsonpath="{.spec.template.spec.containers[?(@.name==\"${c}\")].imagePullPolicy}" 2>/dev/null)
  crit 1 "${c} declares imagePullPolicy Never" \
    "container ${c} has imagePullPolicy '${got}', want Never" \
    "imagePullPolicy is a field of the CONTAINER, not of the Pod: there is no single place to set it once for both. Never means the kubelet uses only what is already in the node's image store and fails the container with ErrImageNeverPull rather than reaching for a registry. Left unset, the API server writes a default that depends on the tag — IfNotPresent for a pinned one like these, Always for :latest — which is why an untouched container already reads IfNotPresent and why that cannot be the answer." \
    -- [ "$got" = "Never" ]
done

crit_all_passed || evidence "$(crit_why)"
report "pull policy ok"
