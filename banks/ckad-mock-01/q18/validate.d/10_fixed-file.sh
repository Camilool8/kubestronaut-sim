#!/usr/bin/env bash
# points: 3
# desc: fixed.yaml uses current apiVersions and legacy.yaml was left alone
set -uo pipefail
[ -f /opt/course/18/fixed.yaml ] || { echo "/opt/course/18/fixed.yaml does not exist"; exit 1; }

# The original is reference material: overwriting it in place loses the
# before/after the task is built on.
grep -q 'apiVersion: batch/v1beta1' /opt/course/18/legacy.yaml 2>/dev/null \
  || { echo "/opt/course/18/legacy.yaml was modified; it should have been left as it was"; exit 1; }

versions=$(yq -r '.apiVersion' /opt/course/18/fixed.yaml 2>/dev/null | sort -u | tr '\n' ' ')
printf '%s' "$versions" | grep -q 'v1beta1' \
  && { echo "fixed.yaml still contains a v1beta1 apiVersion: $versions"; exit 1; }
printf '%s' "$versions" | grep -qw 'batch/v1' \
  || { echo "fixed.yaml has no batch/v1 CronJob (found: $versions)"; exit 1; }
printf '%s' "$versions" | grep -qw 'networking.k8s.io/v1' \
  || { echo "fixed.yaml has no networking.k8s.io/v1 Ingress (found: $versions)"; exit 1; }
echo "apiVersions updated"
