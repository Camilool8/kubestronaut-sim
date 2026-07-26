#!/usr/bin/env bash
# points: 3
# desc: the Service selects the Pods and targets the port they listen on
set -uo pipefail
sel=$(kubectl -n serpens get svc inventory -o json 2>/dev/null | jq -r '.spec.selector | to_entries | map("\(.key)=\(.value)") | sort | join(",")')
[ "$sel" = "app=inventory" ] || { echo "selector is '$sel', want app=inventory"; exit 1; }

out=$(kubectl -n serpens get svc inventory \
  -o jsonpath='{.spec.ports[0].port}|{.spec.ports[0].targetPort}' 2>/dev/null)
[ "$out" = "80|8080" ] \
  && echo "service fixed" \
  || { echo "port|targetPort is '$out', want '80|8080'"; exit 1; }
