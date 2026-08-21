#!/usr/bin/env bash
# points: 3
# desc: the ambassador holds the config, and the app knows nothing about the backend
# expected: wiring.json json
set -uo pipefail
. /banks/_lib/checks.sh

snapshot() {
  kubectl -n dorado get pod checkout -o json 2>/dev/null \
    | jq -S '{conf: ((.spec.volumes[]? | select(.name == "conf") | .configMap.name) // null),
              ambassadorMountPath: ((.spec.containers[]? | select(.name == "ambassador")
                | (.volumeMounts[]? | select(.name == "conf") | .mountPath)) // null)}' 2>/dev/null
}

evidence() {
  show_pair json wiring.json
  show_why "$1"
}

# The question rules this one out: the application must not know where the
# backend lives, so telling it is not a partial answer to anything. This gate
# is about the app's own env, not the conf/mount shape the pane above pairs,
# so its failure gets its own inline pane rather than the shared one.
appspec=$(kubectl -n dorado get pod checkout -o json 2>/dev/null \
  | jq -r '.spec.containers[] | select(.name == "app")')
printf '%s' "$appspec" | grep -q 'payments-backend' && {
  echo "the app container references payments-backend; only the ambassador may know about it"
  show_actual json "$(printf '%s' "$appspec" | jq -S '{env: (.env // [])}' 2>/dev/null)"
  show_why "The pattern's whole promise is that the application knows nothing about where the backend lives: its outbound configuration is permanently localhost, and everything that can change — the Service's name, its namespace, TLS, retries, a circuit breaker — moves into the ambassador. Passing the Service name to the app as an environment variable still makes the request succeed while handing the application exactly the knowledge the pattern exists to take away from it."
  exit 1
}

src=$(kubectl -n dorado get pod checkout \
  -o jsonpath='{.spec.volumes[?(@.name=="conf")].configMap.name}' 2>/dev/null)
path=$(kubectl -n dorado get pod checkout \
  -o jsonpath='{.spec.containers[?(@.name=="ambassador")].volumeMounts[?(@.name=="conf")].mountPath}' 2>/dev/null)

crit 1 "the conf volume carries ambassador-conf" \
  "volume 'conf' is not backed by ambassador-conf (got '$src')" \
  "The ConfigMap holds the proxy's configuration — which port to listen on and which Service to forward to — and it reaches the container as a volume. The volume's own name is only a handle; configMap.name is what says where the contents come from." \
  -- [ "$src" = "ambassador-conf" ]

crit 1 "the ambassador mounts it at nginx's drop-in directory" \
  "ambassador mounts conf at '$path', want /etc/nginx/conf.d" \
  "nginx reads every .conf file in its drop-in directory, which is what makes mounting a ConfigMap there work at all. Mounting one directory higher replaces nginx.conf itself — the file that includes the drop-in directory — and the server never starts." \
  -- [ "$path" = "/etc/nginx/conf.d" ]

crit_all_passed || evidence "$(crit_why)"
report "wiring ok"
