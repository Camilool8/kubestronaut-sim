#!/usr/bin/env bash
# points: 3
# desc: Role ci-deployer grants Pod reads, Deployment create and scale update, and nothing else
set -uo pipefail
. /banks/_lib/checks.sh

NS=pavo

role=$(kubectl -n "$NS" get role ci-deployer -o json 2>/dev/null)
[ -n "$role" ] || {
  echo "Role ci-deployer not found in $NS"
  show_actual text "$(kubectl -n "$NS" get role 2>/dev/null)"
  show_why "A Role is namespaced, and its rules only ever apply inside its own Namespace — one of this name in another Namespace grants nothing here. A ClusterRole called ci-deployer is a different object again and this lookup would not find it."
  exit 1
}

evidence() {
  show_actual json "$(printf '%s' "$role" | jq '.rules' 2>/dev/null)"
  show_why "$1"
}

# RBAC expands each rule into the cross product of its apiGroups, resources and
# verbs, so a rule is asked whether it carries all three rather than whether it
# was written in any particular shape. How the candidate split the rules up is
# not the answer; which triples the Role grants is.
grants() {
  printf '%s' "$role" \
    | jq -e --arg g "$1" --arg r "$2" --arg v "$3" \
      '[.rules[]? | select(((.apiGroups // []) | any(. == $g))
          and ((.resources // []) | any(. == $r))
          and ((.verbs // []) | any(. == $v)))] | length > 0' >/dev/null 2>&1
}

reads_pods() {
  grants "" pods get && grants "" pods list && grants "" pods watch
}

# Everything the Role grants that the question did not ask for, as
# group/resource:verb. The empty group prints as the empty string it is.
extra=$(printf '%s' "$role" | jq -r '
    [ .rules[]?
      | (.apiGroups // [])[] as $g
      | (.resources // [])[] as $r
      | (.verbs // [])[] as $v
      | $g + "/" + $r + ":" + $v ]
    | unique
    | map(. as $t | select(["/pods:get", "/pods:list", "/pods:watch",
                            "apps/deployments:create",
                            "apps/deployments/scale:update"]
                           | any(. == $t) | not))
    | join(", ")' 2>/dev/null)

no_extras() { [ -z "$extra" ]; }

crit 1 "Pods are readable with get, list and watch" \
  "the Role does not grant all of get, list and watch on pods in the core API group" \
  "The empty string in apiGroups is the CORE group, where Pods, ConfigMaps, Secrets and Services live — it reads like an omission and is not one. Deployments are NOT there: they are in apps, and a single rule naming both groups grants each resource in both, which is more than was asked for." \
  -- reads_pods

crit 1 "Deployments can be created" \
  "the Role does not grant create on deployments in the apps API group" \
  "create is what rolls a new Deployment out, and it is deliberately the only write verb on the object itself here. A pipeline that may create but not update cannot quietly rewrite something that is already running." \
  -- grants apps deployments create

crit 1 "the scale subresource can be updated" \
  "the Role does not grant update on deployments/scale in the apps API group" \
  "This is the point of the question. Scaling goes through the scale SUBRESOURCE, written as deployments/scale in resources — a separate endpoint on the same object, with its own authorization. Granting update on deployments would let the pipeline change the image, the command and everything else; granting it on deployments/scale lets it change the replica count and nothing more." \
  -- grants apps deployments/scale update

crit 1 "nothing beyond those five grants" \
  "the Role also grants: $extra" \
  "RBAC is purely additive and has no deny rule, so 'and nothing else' is expressed by leaving grants out rather than by forbidding them. kubectl create role gives EVERY verb it was passed to every resource in an API group — one rule per group, each one a cross product — so --verb=get,list,watch,create,update over pods and deployments grants create and update on Pods and update on whole Deployments too. The rows of the question's table differ in group, resource AND verb, so they cannot be collapsed into one rule: this Role is three rules." \
  -- no_extras

crit_all_passed || evidence "$(crit_why)"
report "role scoped correctly"
