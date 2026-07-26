#!/usr/bin/env bash
# points: 3
# desc: status-page is a NodePort Service on port 80 with node port 30081
set -uo pipefail
out=$(kubectl -n aquila get svc status-page \
  -o jsonpath='{.spec.type}|{.spec.ports[0].port}|{.spec.ports[0].nodePort}' 2>/dev/null)
[ "$out" = "NodePort|80|30081" ] \
  && echo "nodeport ok" \
  || { echo "type|port|nodePort is '$out', want 'NodePort|80|30081'"; exit 1; }
