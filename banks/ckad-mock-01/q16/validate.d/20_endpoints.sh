#!/usr/bin/env bash
# points: 4
# desc: both replicas pass readiness and appear as ready Service endpoints
set -uo pipefail
# Checks are independent, so this one cannot assume 10_probes.sh passed —
# and "2 ready endpoints" is true of a Deployment with no readinessProbe
# at all, because a container without one is ready the moment it starts.
# Unqualified, this check handed out free points on an untouched
# environment. Requiring the probe first is what makes the endpoint count
# evidence of anything.
probe=$(kubectl -n hydra get deploy orders-api \
  -o jsonpath='{.spec.template.spec.containers[0].readinessProbe.httpGet.port}' 2>/dev/null)
[ -n "$probe" ] || { echo "no readinessProbe is configured, so endpoint readiness proves nothing"; exit 1; }

ready=$(kubectl -n hydra get deploy orders-api -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ "$ready" = "2" ] || { echo "readyReplicas is '$ready', want 2"; exit 1; }

# The behavioural half: readiness that never passes leaves the Pods
# running and the Service empty. EndpointSlice rather than the deprecated
# Endpoints object.
count=$(kubectl -n hydra get endpointslice -l kubernetes.io/service-name=orders-api -o json 2>/dev/null \
  | jq '[.items[].endpoints[]? | select(.conditions.ready == true)] | length')
[ "$count" = "2" ] \
  && echo "2 ready endpoints" \
  || { echo "the Service has $count ready endpoints, want 2"; exit 1; }
