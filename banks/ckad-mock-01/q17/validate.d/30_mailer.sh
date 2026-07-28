#!/usr/bin/env bash
# points: 4
# desc: the unpullable image was recorded and the mailer Deployment repaired
set -uo pipefail
got=$(cat /opt/course/17/bad-image 2>/dev/null | tr -d '[:space:]')
[ "$got" = "nginx:0.0.0-corvus-nonexistent" ] \
  || { echo "/opt/course/17/bad-image contains '$got', want nginx:0.0.0-corvus-nonexistent"; exit 1; }

img=$(kubectl -n corvus get deploy mailer \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="mailer")].image}' 2>/dev/null)
[ "$img" = "nginx:1.29-alpine" ] || { echo "mailer image is '$img', want nginx:1.29-alpine"; exit 1; }

ready=$(kubectl -n corvus get deploy mailer -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ "$ready" = "1" ] || { echo "mailer readyReplicas is '$ready', want 1"; exit 1; }

# The healthy workload was a control, not a casualty.
fe=$(kubectl -n corvus get deploy frontend -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ "$fe" = "1" ] \
  && echo "mailer fixed, frontend untouched" \
  || { echo "frontend was supposed to be left alone (readyReplicas='$fe')"; exit 1; }
