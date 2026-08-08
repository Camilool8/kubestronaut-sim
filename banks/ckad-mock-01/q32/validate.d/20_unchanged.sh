#!/usr/bin/env bash
# points: 2
# desc: the restart changed nothing about what the Deployment runs
set -uo pipefail
. /banks/_lib/checks.sh
KEY=kubectl.kubernetes.io/restartedAt
evidence() {
  show_actual json "$(kubectl -n sagitta get deploy session-store -o json 2>/dev/null \
    | jq '{replicas: .spec.replicas,
           containers: [.spec.template.spec.containers[] | {name, image, envFrom}],
           templateAnnotations: .spec.template.metadata.annotations}')"
  show_why "$1"
}

img=$(kubectl -n sagitta get deploy session-store \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="store")].image}' 2>/dev/null)
want=$(kubectl -n sagitta get deploy session-store -o jsonpath='{.spec.replicas}' 2>/dev/null)
conf=$(kubectl -n sagitta get deploy session-store -o json 2>/dev/null \
  | jq -r '[.spec.template.spec.containers[] | select(.name == "store")
            | .envFrom[]?.configMapRef.name] | join(",")')
stamp=$(kubectl -n sagitta get deploy session-store -o json 2>/dev/null \
  | jq -r --arg k "$KEY" '.spec.template.metadata.annotations[$k] // empty')

shape_intact() { [ "$want" = "3" ] && [ "$conf" = "session-store-conf" ]; }

# Both of these are gates rather than criteria. The question rules the edits
# out, so making one is not a partial answer — and leaving the spec alone is
# also what a candidate who has done nothing at all has done, so respecting
# them cannot earn anything either. What is scored below is the restart that
# these two protect.
[ "$img" = "nginx:1.27-alpine" ] || {
  echo "container 'store' has image '$img', want nginx:1.27-alpine"
  evidence "The question ruled this out: nothing about what the Deployment runs was to change. A restart is not an upgrade — bumping the tag and putting it back reaches the same string through two rollouts, and in between every Pod is serving a version nobody asked for. An empty value here usually means the container was renamed, which is a template change of its own."
  exit 1
}

shape_intact || {
  echo "replicas='$want' (want 3), envFrom ConfigMaps='$conf' (want session-store-conf)"
  evidence "The question ruled this out: the replica count and the container's configuration were to be exactly what they were. Scaling to zero and back up cycles every Pod at the cost of a total outage, and it changes spec.replicas twice on the way. The ConfigMap reference goes with it because dropping and re-adding envFrom is another way to force a rollout by changing the very thing the question protects."
  exit 1
}

crit 1 "the Pods were cycled by a restart, not by an edit to any of that" \
  "the Pod template carries no $KEY: nothing here has changed, but nothing has restarted it either" \
  "This is what makes 'nothing changed' worth anything: a Deployment nobody has touched has trivially changed nothing. What is graded is that the image, the replica count and the config source are still exactly as they were AFTER a rollout restart cycled the Pods. kubectl records that restart as a timestamp in the POD TEMPLATE — a template change that alters nothing about what the workload runs, which is precisely why it is the tool for this. Deleting the Pods by hand cycles them and records nothing at all." \
  -- [ -n "$stamp" ]

crit_all_passed || evidence "$(crit_why)"
report "spec unchanged: nginx:1.27-alpine, 3 replicas, session-store-conf"
