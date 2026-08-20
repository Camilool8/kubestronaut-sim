#!/usr/bin/env bash
# points: 3
# desc: an emptyDir is declared once and mounted at /var/log/orders in both api and shipper
set -uo pipefail
. /banks/_lib/checks.sh

ns=volans
dep=orders-api
path=/var/log/orders

spec=$(kubectl -n "$ns" get deploy "$dep" -o json 2>/dev/null \
  | jq '.spec.template.spec // empty' 2>/dev/null)

evidence() {
  show_actual json "$(printf '%s' "${spec:-}" \
    | jq '{volumes: [.volumes[]? | {name, emptyDir}],
           mounts: [(.containers[]?, .initContainers[]?)
                    | {name, volumeMounts: (.volumeMounts // [])}]}' 2>/dev/null)"
  show_why "$1"
}

[ -n "$spec" ] || {
  echo "Deployment $dep not found in Namespace $ns"
  show_actual text "$(kubectl -n "$ns" get deploy 2>/dev/null)"
  show_why "The volume and both of its mounts are read off the Pod template of Deployment orders-api in Namespace volans, and the pane above lists what that Namespace actually holds. Nothing added to a live Pod instead of the template survives the next time the ReplicaSet replaces it, and nothing outside this Deployment is read here at all."
  exit 1
}

mains=$(printf '%s' "$spec" | jq -r '[.containers[]?.name] | join(" ")' 2>/dev/null)
has_name "$mains" api || {
  echo "no container named 'api' in the Pod template of deploy/$dep (found: $(name_list "$mains"))"
  evidence "The application container was seeded as 'api' and the question asks for it to be left alone — a sidecar is ADDED beside it. A template with no container by that name means it was renamed or replaced, and the log this question ships would then be coming from something other than the application it is supposed to be watching."
  exit 1
}

# Do-no-harm, so a gate rather than a criterion: this is true of the untouched
# seed, and a criterion the seed already satisfies is a point awarded for no
# work. It fails only if the application container was rewritten to write
# somewhere else, which makes every other criterion here meaningless.
api_cmd=$(printf '%s' "$spec" \
  | jq -r 'first(.containers[]? | select(.name == "api")
           | ((.command // []) + (.args // [])) | join(" ")) // ""' 2>/dev/null \
  | tr '\n' ' ')
case " $api_cmd " in
  *"$path/app.log"*) ;;
  *)
    echo "the api container no longer writes to $path/app.log"
    evidence "The question asks for the api container to keep its name, its image and its command, because the point of the exercise is to ship the log it already produces rather than to change what it produces. Its command no longer mentions $path/app.log, so there is nothing left for the sidecar to tail and nothing here can be scored. Put the container's original command back and add the volume, the mounts and the sidecar around it."
    exit 1
    ;;
esac

# Name-agnostic on the mounts and strict about the shape: what matters is that
# ONE volume, and an emptyDir at that, appears at the same path on both sides.
# A ConfigMap or a hostPath mounted there would read very differently.
empty_vols=$(printf '%s' "$spec" \
  | jq -r '[.volumes[]? | select(.emptyDir != null) | .name] | join(" ")' 2>/dev/null)
api_vol=$(printf '%s' "$spec" \
  | jq -r --arg p "$path" 'first(.containers[]? | select(.name == "api")
           | .volumeMounts[]? | select(.mountPath == $p) | .name) // ""' 2>/dev/null)
ship_vol=$(printf '%s' "$spec" \
  | jq -r --arg p "$path" 'first(.initContainers[]? | select(.name == "shipper")
           | .volumeMounts[]? | select(.mountPath == $p) | .name) // ""' 2>/dev/null)

api_mounts_scratch() { [ -n "$api_vol" ] && has_name "$empty_vols" "$api_vol"; }
shipper_shares_it() {
  [ -n "$ship_vol" ] && [ "$ship_vol" = "$api_vol" ] && has_name "$empty_vols" "$ship_vol"
}

crit 1 "the Pod declares an emptyDir volume named orders-logs" \
  "no Pod-level emptyDir named 'orders-logs' (emptyDir volumes: $(name_list "$empty_vols"))" \
  "A volume is declared once, at Pod level, and mounted separately by each container that wants it. emptyDir is the right kind here: it is created empty when the Pod is scheduled, lives exactly as long as that Pod, and is shared by every container in it — which is what lets one container write a file another can read. The question names it orders-logs." \
  -- has_name "$empty_vols" orders-logs

crit 1 "the api container mounts that scratch volume at $path" \
  "the api container has no emptyDir mounted at $path (volume mounted there: '${api_vol:-<none>}')" \
  "Declaring a volume is not mounting it. Without a volumeMounts entry on the api container, $path is still an ordinary directory in that container's own writable layer: the application keeps working, the file is written, and nothing outside the container can ever see it. Mounting the emptyDir over that path is what moves the file into storage the Pod shares." \
  -- api_mounts_scratch

crit 1 "the shipper sidecar mounts the same volume at the same path" \
  "shipper mounts '${ship_vol:-<none>}' at $path while api mounts '${api_vol:-<none>}' — they must be the same emptyDir" \
  "Sharing needs both halves to agree: the same volume, mounted at the same path, on both containers. Two separate emptyDir volumes, or the same one mounted somewhere else in the sidecar, leave 'tail -F' waiting on a file that will never appear — and because -F retries forever rather than failing, the sidecar looks perfectly healthy while shipping nothing. The sidecar's volumeMounts belong on its initContainers entry, which is where a native sidecar is declared." \
  -- shipper_shares_it

crit_all_passed || evidence "$(crit_why)"
report "shared volume ok"
