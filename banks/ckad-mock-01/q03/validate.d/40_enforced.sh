#!/usr/bin/env bash
# points: 4
# desc: the policy is actually enforced — frontend reaches api, metrics does not
set -uo pipefail
# The three checks above read the policy's YAML. This one reads its
# effect, which is a different question: a policy can be shaped perfectly
# and still allow everything if podSelector matches nothing, or deny
# everything if the ingress rule names the wrong label.
#
# Uses `exec` into the Deployments the question already provides rather
# than creating probe Pods: no mutation, and it finishes in seconds
# rather than eating the 30s check budget on Pod scheduling. The images
# are alpine-based, so busybox wget is available.
api=$(kubectl -n orbit get pod -l role=api \
  -o jsonpath='{.items[?(@.status.phase=="Running")].status.podIP}' 2>/dev/null | awk '{print $1}')
[ -n "$api" ] || { echo "no running api Pod to test against"; exit 1; }

if ! kubectl -n orbit exec deploy/frontend -- \
     wget -q -T 5 -O /dev/null "http://${api}:80" 2>/dev/null; then
  echo "frontend cannot reach api on port 80, but the policy should allow it"
  exit 1
fi

# Must fail. A policy that is present but unenforced lets this through,
# which is precisely the gap this check exists to close.
if kubectl -n orbit exec deploy/metrics -- \
     wget -q -T 5 -O /dev/null "http://${api}:80" 2>/dev/null; then
  echo "metrics reached api on port 80 — ingress is not restricted to role=frontend"
  exit 1
fi
echo "policy enforced: frontend allowed, metrics denied"
