#!/usr/bin/env bash
# points: 2
# desc: fixed.yaml uses current apiVersions and legacy.yaml was left alone
set -uo pipefail
. /banks/_lib/checks.sh
[ -f /opt/course/18/fixed.yaml ] || {
  echo "/opt/course/18/fixed.yaml does not exist"
  show_actual yaml "$(cat /opt/course/18/legacy.yaml 2>/dev/null)"
  show_why "The task asks for a CORRECTED COPY at a second path, so the original survives as the before half of the comparison. Above is the original as it stands; nothing exists at the path the copy was supposed to go to."
  exit 1
}

pristine="/banks/${BANK:-ckad-mock-01}/q18/files/legacy.yaml"
if [ -f "$pristine" ]; then
  cmp -s "$pristine" /opt/course/18/legacy.yaml || {
    echo "/opt/course/18/legacy.yaml was modified; it should have been left as it was"
    show_actual yaml "$(cat /opt/course/18/legacy.yaml 2>/dev/null)"
    show_why "The original is the reference material this task is built on: it is the manifest written against the removed API versions, and editing it in place destroys the before-and-after. The correction belongs in a copy at the second path."
    exit 1
  }
else

  yaml_api_versions /opt/course/18/legacy.yaml | grep -q 'batch/v1beta1' || {
    echo "/opt/course/18/legacy.yaml was modified; it should have been left as it was"
    show_actual yaml "$(cat /opt/course/18/legacy.yaml 2>/dev/null)"
    show_why "The original no longer carries the removed apiVersion it was seeded with, so it has been edited in place. It is the reference material for the task; the correction belongs in a copy at the second path."
    exit 1
  }
fi

versions=$(yaml_api_versions /opt/course/18/fixed.yaml | tr '\n' ' ')
fixed() {
  show_actual yaml "$(cat /opt/course/18/fixed.yaml 2>/dev/null)"
  show_why "$1"
}

no_beta() { ! printf '%s' "$versions" | grep -q 'v1beta1'; }

crit 1 "no v1beta1 apiVersion is left" \
  "fixed.yaml still contains a v1beta1 apiVersion: $versions" \
  "A beta API version is not merely deprecated here — it has been removed from the cluster, so a manifest naming one has nothing to apply against. Both documents in this file have to move to a version the cluster actually serves." \
  -- no_beta

crit 1 "the CronJob is on batch/v1" \
  "fixed.yaml has no batch/v1 CronJob (found: $versions)" \
  "CronJob's move out of beta was a pure version bump: the schema did not change, so the apiVersion line moves and everything below it stays exactly as it was. A missing document is the other way to reach this — the file has to keep both resources." \
  -- has_name "$versions" 'batch/v1'

crit 1 "the Ingress is on networking.k8s.io/v1" \
  "fixed.yaml has no networking.k8s.io/v1 Ingress (found: $versions)" \
  "The Ingress is the half that is a real migration rather than a rename, so its apiVersion moving is only the first of several changes it needs. A missing document is the other way to reach this — the file has to keep both resources." \
  -- has_name "$versions" 'networking.k8s.io/v1'

crit_all_passed || fixed "$(crit_why)"
report "apiVersions updated"
