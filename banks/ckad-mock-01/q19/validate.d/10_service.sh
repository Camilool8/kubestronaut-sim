#!/usr/bin/env bash
# points: 3
# desc: the Service selects the Pods and targets the port they listen on
set -uo pipefail
sel=$(kubectl -n serpens get svc inventory -o json 2>/dev/null | jq -r '.spec.selector | to_entries | map("\(.key)=\(.value)") | sort | join(",")')
[ "$sel" = "app=inventory" ] || { echo "selector is '$sel', want app=inventory"; exit 1; }

# The port entry is selected by its published port, not by position. The
# question asks for port 80 specifically, so `port == 80` is the stable
# handle; a candidate who left an extra port entry in place still has a
# Service that exposes 80 correctly.
target=$(kubectl -n serpens get svc inventory \
  -o jsonpath='{.spec.ports[?(@.port==80)].targetPort}' 2>/dev/null)
[ -n "$target" ] || { echo "the Service publishes no port 80"; exit 1; }
[ "$target" = "8080" ] \
  && echo "service fixed" \
  || { echo "targetPort for port 80 is '$target', want 8080"; exit 1; }
