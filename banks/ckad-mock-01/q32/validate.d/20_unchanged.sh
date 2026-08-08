#!/usr/bin/env bash
# points: 2
# desc: the restart changed nothing about what the Deployment runs
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual json "$(kubectl -n sagitta get deploy session-store -o json 2>/dev/null \
    | jq '{replicas: .spec.replicas,
           containers: [.spec.template.spec.containers[] | {name, image, envFrom}]}')"
  show_why "$1"
}

img=$(kubectl -n sagitta get deploy session-store \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="store")].image}' 2>/dev/null)
want=$(kubectl -n sagitta get deploy session-store -o jsonpath='{.spec.replicas}' 2>/dev/null)
conf=$(kubectl -n sagitta get deploy session-store -o json 2>/dev/null \
  | jq -r '[.spec.template.spec.containers[] | select(.name == "store")
            | .envFrom[]?.configMapRef.name] | join(",")')

crit 1 "the container still runs the image it started on" \
  "container 'store' has image '$img', want nginx:1.27-alpine" \
  "A restart is not an upgrade. Bumping the tag and putting it back reaches the same string through two rollouts, and in between every Pod is serving a version nobody asked for. An empty value here usually means the container was renamed, which is a template change of its own." \
  -- [ "$img" = "nginx:1.27-alpine" ]

shape_intact() { [ "$want" = "3" ] && [ "$conf" = "session-store-conf" ]; }

crit 1 "the replica count and the config source are untouched" \
  "replicas='$want' (want 3), envFrom ConfigMaps='$conf' (want session-store-conf)" \
  "Scaling to zero and back up cycles every Pod at the cost of a total outage, and it changes spec.replicas twice on the way. The ConfigMap reference is checked with it because dropping and re-adding envFrom is another way to force a rollout by changing the very thing the question protects." \
  -- shape_intact

crit_all_passed || evidence "$(crit_why)"
report "spec unchanged: nginx:1.27-alpine, 3 replicas, session-store-conf"
