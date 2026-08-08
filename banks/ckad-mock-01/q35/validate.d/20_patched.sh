#!/usr/bin/env bash
# points: 2
# desc: the change lives in the overlay as a patch, and base/ was left alone
set -uo pipefail
. /banks/_lib/checks.sh
K=/opt/course/35/overlays/prod/kustomization.yaml
BASE=/opt/course/35/base/deployment.yaml

overlay_pane() {
  show_actual text "$(cat "$K" 2>/dev/null)"
  show_why "$1"
}
base_pane() {
  show_actual text "$(cat "$BASE" 2>/dev/null)"
  show_expected text "/banks/${BANK:-ckad-mock-01}/q35/files/base/deployment.yaml"
  show_why "$1"
}

[ -f "$BASE" ] || {
  echo "$BASE no longer exists"
  show_actual text "$(ls -R /opt/course/35 2>/dev/null)"
  show_expected text "/banks/${BANK:-ckad-mock-01}/q35/files/base/deployment.yaml"
  show_why "The overlay builds on this file, so deleting it is not a way of getting out of the rule against editing it. Restore it from the document beside this pane and put the change in the overlay's kustomization instead."
  exit 1
}

patches=$(yq -r '((.patches // []) | length)
                 + ((.patchesStrategicMerge // []) | length)
                 + ((.patchesJson6902 // []) | length)' "$K" 2>/dev/null)

api='.spec.template.spec.containers[] | select(.name == "api")'
base_env=$(yq -r "$api | (.env // []) | length" "$BASE" 2>/dev/null)
base_delay=$(yq -r "$api | .readinessProbe.initialDelaySeconds" "$BASE" 2>/dev/null)

declares_a_patch() { [ -n "$patches" ] && [ "$patches" -ge 1 ] 2>/dev/null; }
base_untouched() { [ "$base_env" = "0" ] && [ "$base_delay" = "30" ]; }

# The question rules this one out: only the overlay's kustomization was to be
# completed. Leaving base/ alone is a gate rather than a criterion because a
# candidate who has written nothing anywhere has left it alone too.
base_untouched || {
  echo "base/deployment.yaml has been edited: container 'api' now has $base_env env var(s) and initialDelaySeconds '$base_delay', want 0 and 30"
  base_pane "The question ruled this out: nothing under base/ was to be edited. The base is what every environment shares; the overlay is what one environment differs by. Putting LEDGER_MODE=prod in the base gives it to staging too, silently, the next time anyone builds that overlay — and the overlay that was supposed to document production's differences documents nothing at all. Restore the file from the document beside this pane and make the change in the overlay."
  exit 1
}

crit 1 "the overlay declares a patch" \
  "the overlay's kustomization declares no patches at all" \
  "A transformer changes one well-known thing across every resource, and its vocabulary is deliberately small — images, replicas, namePrefix, namespace, labels. Anything outside it is a patch, and both of this question's changes are outside it. Hand-writing the finished Deployment into the overlay's resources reaches the same rendered output and abandons the base, which is the one thing the layout exists to share." \
  -- declares_a_patch

crit_all_passed || overlay_pane "$(crit_why)"
report "patched in the overlay, base untouched"
