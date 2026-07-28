#!/usr/bin/env bash
# points: 3
# desc: status-page is a NodePort Service on port 80 with node port 30081
set -uo pipefail
type=$(kubectl -n aquila get svc status-page -o jsonpath='{.spec.type}' 2>/dev/null)
[ "$type" = "NodePort" ] || { echo "type is '$type', want NodePort"; exit 1; }

# The port entry is selected by its published port rather than by
# position: the question pins port 80 and node port 30081, so `port == 80`
# is the handle that says which entry is being asked about.
np=$(kubectl -n aquila get svc status-page \
  -o jsonpath='{.spec.ports[?(@.port==80)].nodePort}' 2>/dev/null)
[ -n "$np" ] || { echo "the Service publishes no port 80"; exit 1; }
[ "$np" = "30081" ] \
  && echo "nodeport ok" \
  || { echo "nodePort for port 80 is '$np', want 30081"; exit 1; }
