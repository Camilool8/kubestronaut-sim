#!/usr/bin/env bash
# points: 3
# desc: the liveness probe survives and now targets the port the container serves
set -uo pipefail
. /banks/_lib/checks.sh

evidence() {
  show_actual json "$(kubectl -n horologium get deploy session-store -o json 2>/dev/null \
    | jq --arg c store '
      if any(.spec.template.spec.containers[]; .name == $c)
      then first(.spec.template.spec.containers[] | select(.name == $c))
           | {name, ports, livenessProbe}
      else {"no such container": $c,
            "containers that exist": [.spec.template.spec.containers[].name]}
      end')"
  show_why "$1"
}

names=$(kubectl -n horologium get deploy session-store \
  -o jsonpath='{.spec.template.spec.containers[*].name}' 2>/dev/null)
has_name "$names" store || {
  echo "the Deployment has no container named store (found: $(name_list "$names"))"
  evidence "The container was to keep its name; only the probe's target was wrong. Renaming or replacing it answers a different question and leaves the same fault in place."
  exit 1
}

probe=$(kubectl -n horologium get deploy session-store -o json 2>/dev/null \
  | jq -r --arg c store 'first(.spec.template.spec.containers[] | select(.name == $c)) | .livenessProbe // empty')
[ -n "$probe" ] || {
  echo "the store container has no livenessProbe at all"
  evidence "Deleting the probe does stop the restarts, and it is the wrong repair. A liveness probe is what turns a wedged process into a restarted one with nobody being paged: without it Kubernetes calls the container healthy for as long as its first process is alive, which a deadlocked server and an exhausted thread pool both are. The question asks for a probe that is present AND correct."
  exit 1
}

port=$(printf '%s' "$probe" | jq -r '.httpGet.port // "-"')
path=$(printf '%s' "$probe" | jq -r '.httpGet.path // "-"')

# The seeded probe is already an HTTP GET of / — its only fault is the port — so
# "the path is untouched" is true before the candidate arrives. What was left
# alone counts once the thing beside it has been repaired.
path_kept_on_a_repaired_probe() { [ "$port" = "80" ] && [ "$path" = "/" ]; }

crit 2 "aimed at the port the container serves on" \
  "livenessProbe.httpGet.port is '$port', want 80" \
  "The container declares containerPort 80 and its server listens there; the probe was dialling 8080, where nothing is bound, so every check came back refused and the kubelet restarted the container on schedule. containerPort itself opens nothing — it is documentation — but it is the honest record of where the application serves." \
  -- [ "$port" = "80" ]

crit 1 "still an HTTP GET of / on the repaired probe" \
  "livenessProbe.httpGet.path is '$path' and .port is '$port'; the path must still be / on a probe whose port has been corrected to 80" \
  "The probe had one fault and it was the port. Swapping the mechanism — an exec probe, a tcpSocket probe — or moving the path changes what is being checked rather than repairing it, and an HTTP GET of / against nginx is a real answer from the server rather than a socket that merely opens. The path was already / when you arrived, so leaving it there is not the answer on its own: it counts once the port beside it is right." \
  -- path_kept_on_a_repaired_probe

crit_all_passed || evidence "$(crit_why)"
report "probe repaired"
