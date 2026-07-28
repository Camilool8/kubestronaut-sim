#!/usr/bin/env bash
# points: 3
# desc: fixed.yaml uses current apiVersions and legacy.yaml was left alone
set -uo pipefail
. /banks/_lib/checks.sh
[ -f /opt/course/18/fixed.yaml ] || { echo "/opt/course/18/fixed.yaml does not exist"; exit 1; }

# The original is reference material: overwriting it in place loses the
# before/after the task is built on.
#
# Compared against the pristine copy the instance seeded from, rather
# than grepped for one line out of it. The grep was whitespace-exact on a
# YAML file, so re-saving legacy.yaml from an editor that normalised
# `apiVersion:  batch/v1beta1` failed a candidate who had not meaningfully
# touched it — and, in the other direction, it passed anyone who gutted
# the file as long as that one line survived. cmp answers the question
# the check is actually asking.
pristine="/banks/${BANK:-ckad-mock-01}/q18/files/legacy.yaml"
if [ -f "$pristine" ]; then
  cmp -s "$pristine" /opt/course/18/legacy.yaml \
    || { echo "/opt/course/18/legacy.yaml was modified; it should have been left as it was"; exit 1; }
else
  # A bank laid out differently still gets the weaker structural check
  # rather than no check at all.
  yaml_api_versions /opt/course/18/legacy.yaml | grep -q 'batch/v1beta1' \
    || { echo "/opt/course/18/legacy.yaml was modified; it should have been left as it was"; exit 1; }
fi

versions=$(yaml_api_versions /opt/course/18/fixed.yaml | tr '\n' ' ')
printf '%s' "$versions" | grep -q 'v1beta1' \
  && { echo "fixed.yaml still contains a v1beta1 apiVersion: $versions"; exit 1; }
printf '%s' "$versions" | grep -qw 'batch/v1' \
  || { echo "fixed.yaml has no batch/v1 CronJob (found: $versions)"; exit 1; }
printf '%s' "$versions" | grep -qw 'networking.k8s.io/v1' \
  || { echo "fixed.yaml has no networking.k8s.io/v1 Ingress (found: $versions)"; exit 1; }
echo "apiVersions updated"
