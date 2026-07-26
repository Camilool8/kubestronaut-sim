#!/usr/bin/env bash
# points: 1
# desc: Pod checkout runs app (busybox) and ambassador (nginx), and is Running
set -uo pipefail
names=$(kubectl -n dorado get pod checkout \
  -o jsonpath='{range .spec.containers[*]}{.name}{"\n"}{end}' 2>/dev/null | sort | tr '\n' ' ')
names=${names% }
[ "$names" = "ambassador app" ] || { echo "containers are '$names', want 'app' and 'ambassador'"; exit 1; }

app=$(kubectl -n dorado get pod checkout -o jsonpath='{.spec.containers[?(@.name=="app")].image}' 2>/dev/null)
amb=$(kubectl -n dorado get pod checkout -o jsonpath='{.spec.containers[?(@.name=="ambassador")].image}' 2>/dev/null)
[ "$app" = "busybox:1.37" ] || { echo "app image is '$app', want busybox:1.37"; exit 1; }
[ "$amb" = "nginx:1.29-alpine" ] || { echo "ambassador image is '$amb', want nginx:1.29-alpine"; exit 1; }

phase=$(kubectl -n dorado get pod checkout -o jsonpath='{.status.phase}' 2>/dev/null)
[ "$phase" = "Running" ] \
  && echo "containers ok" \
  || { echo "pod phase is '$phase', want Running"; exit 1; }
