#!/usr/bin/env bash
# points: 5
# desc: FeatureToggle dark-mode exists in sextans with the requested field values
# expected: toggle.json json
set -uo pipefail
. /banks/_lib/checks.sh

base=/apis/flags.kubestronaut.dev/v1alpha1/namespaces/sextans/featuretoggles
obj=$(kubectl get --raw "$base/dark-mode" 2>/dev/null)
[ -n "$obj" ] || {
  echo "no FeatureToggle named dark-mode in sextans"
  show_actual json "$(kubectl get --raw "$base" 2>/dev/null | jq '[.items[] | {name: .metadata.name, spec}]' 2>/dev/null)"
  show_why "The pane lists every FeatureToggle in sextans. A custom resource is namespaced here, so one created without -n sextans went to default instead and is invisible from this query — and a manifest whose apiVersion omits the group never reached this type at all."
  exit 1
}

# jq's // treats false as absent, so a toggle left off would read as empty here.
enabled=$(printf '%s' "$obj" | jq -r '.spec.enabled | if . == null then "" else tostring end' 2>/dev/null)
rollout=$(printf '%s' "$obj" | jq -r '.spec.rollout | if . == null then "" else tostring end' 2>/dev/null)
owner=$(printf '%s' "$obj" | jq -r '.spec.owner // ""' 2>/dev/null)

# Direct field access rather than `//`, deliberately: jq's // treats false
# as absent (the same trap the enabled/rollout reads above call out), which
# would turn a candidate's correctly-typed `enabled: false` into a null in
# this pane. `.spec.enabled` alone already reads null when the key is
# missing, since jq indexes null safely — no fallback needed.
snapshot() {
  printf '%s' "${obj:-null}" \
    | jq -S '{enabled: .spec.enabled, rollout: .spec.rollout, owner: .spec.owner}' 2>/dev/null
}

evidence() {
  show_pair json toggle.json
  show_why "$1"
}

crit 2 "enabled is true" \
  "spec.enabled is '$enabled', want true" \
  "The definition types this field as a boolean, so the value stored is true rather than the string \"true\" — quoting it in the manifest makes the API server reject the object outright, which is the schema doing its job." \
  -- [ "$enabled" = "true" ]

crit 2 "rollout is 25" \
  "spec.rollout is '$rollout', want 25" \
  "This one is typed as an integer with a minimum and a maximum, and those bounds are enforced by the API server exactly as they would be for a built-in field. kubectl explain reads the same schema, which is why it works on a type nobody compiled into it." \
  -- [ "$rollout" = "25" ]

crit 1 "owner is platform-team" \
  "spec.owner is '$owner', want platform-team" \
  "A plain required string. Leaving it out is rejected at admission rather than accepted and defaulted, because the schema lists it under required." \
  -- [ "$owner" = "platform-team" ]

crit_all_passed || evidence "$(crit_why)"
report "feature toggle created"
