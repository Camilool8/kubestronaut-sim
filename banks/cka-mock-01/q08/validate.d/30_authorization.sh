#!/usr/bin/env bash
# points: 3
# desc: ci-bot may read Pods, create Deployments and scale them, and may do nothing more
set -uo pipefail
. /banks/_lib/checks.sh

NS=pavo
SUBJECT=system:serviceaccount:pavo:ci-bot

# One SubjectAccessReview per question, asked up front so the messages can quote
# the answers back. The first word is all of it: some versions add a reason.
answer() {
  kubectl auth can-i "$1" "$2" -n "$3" --as="$SUBJECT" 2>/dev/null \
    | head -1 | awk '{print $1}'
}
a_list=$(answer list pods "$NS")
a_create=$(answer create deployments "$NS")
a_scale=$(answer update deployments/scale "$NS")
a_delete=$(answer delete pods "$NS")
a_update=$(answer update deployments "$NS")
a_other=$(answer list pods kube-system)

decided() {
  case ${1-} in
    yes|no) return 0 ;;
    *) return 1 ;;
  esac
}
for a in "$a_list" "$a_create" "$a_scale" "$a_delete" "$a_update" "$a_other"; do
  decided "$a" || {
    echo "the authorization queries returned no answer ('$a')"
    show_actual text "$(kubectl auth can-i --list -n "$NS" --as="$SUBJECT" 2>/dev/null)"
    show_why "This check asks the API server, as that ServiceAccount, whether each action is permitted. No answer at all is an environment fault rather than a wrong one, so it is reported as such: nothing about the Role or the RoleBinding is being judged here."
    exit 1
  }
done

evidence() {
  show_actual text "$(kubectl auth can-i --list -n "$NS" --as="$SUBJECT" 2>/dev/null)"
  show_why "$1"
}

allowed() { [ "${1-}" = "yes" ]; }

# can-i answers about a subject that was never created, because a binding names
# a subject by string. On an untouched Namespace the three denials below are all
# true for the wrong reason — nothing grants anything to anybody — so every
# criterion here is meaningless until the account exists. A gate rather than a
# seventh criterion: none of these six questions can be asked of nobody.
kubectl -n "$NS" get serviceaccount ci-bot >/dev/null 2>&1 || {
  echo "there is no ServiceAccount ci-bot in $NS to authorize"
  show_actual text "$(kubectl -n "$NS" get serviceaccount 2>/dev/null)"
  show_why "Every criterion in this check asks what ci-bot may do, and RBAC will answer those questions for a name that belongs to no object — which would score the three denials on a Namespace where nothing was granted at all. The answers only mean something once the account the question asks for exists. Create it first; 20_binding.sh scores it."
  exit 1
}

crit 1 "may list Pods in pavo" \
  "listing Pods as ci-bot answers '$a_list', want yes" \
  "The pane lists every rule that resolves for this ServiceAccount in pavo. Nothing there grants list on pods: either the Role never carried the verb, or the RoleBinding never joined the Role to this subject." \
  -- allowed "$a_list"

crit 1 "may create Deployments in pavo" \
  "creating a Deployment as ci-bot answers '$a_create', want yes" \
  "Deployments live in the apps API group, not the core one. A rule written with apiGroups [\"\"] — the core group — grants nothing on deployments however the resources and verbs read, and this is the single most common way this task half-works." \
  -- allowed "$a_create"

crit 1 "may update deployments/scale in pavo" \
  "updating deployments/scale as ci-bot answers '$a_scale', want yes" \
  "kubectl scale writes to the SCALE subresource, a separate endpoint on the same object with its own authorization. It is named deployments/scale in a rule's resources list, and no grant on deployments itself reaches it — a Role with update on deployments and nothing else cannot scale through this path." \
  -- allowed "$a_scale"

crit 1 "may NOT delete Pods in pavo" \
  "deleting a Pod in pavo answers '$a_delete', want no" \
  "RBAC is purely additive and has no deny rule, so the union of every binding naming this subject is what applies and a narrow Role never takes a wide grant away. An answer of yes means something else still grants it — most often a ClusterRoleBinding to cluster-admin or edit. Ask can-i --list to see everything that resolves, and remove the grant rather than trying to override it." \
  -- negate allowed "$a_delete"

crit 1 "may NOT update Deployments in pavo" \
  "updating a Deployment in pavo answers '$a_update', want no" \
  "This is the trap the question is built on. update on deployments and update on deployments/scale are different grants: the first rewrites the whole object — image, command, replicas and all — while the second changes only the replica count. Granting the object when the subresource was asked for passes a casual test with kubectl scale and hands the pipeline far more than it needs." \
  -- negate allowed "$a_update"

crit 1 "may NOT read Pods in kube-system" \
  "listing Pods in kube-system answers '$a_other', want no" \
  "A RoleBinding grants its Role's rules only inside its own Namespace, so a correct answer denies this without anything being written about kube-system at all. An answer of yes means the grant was made cluster-wide — a ClusterRoleBinding reaches every Namespace at once, and a ClusterRole bound by a RoleBinding would not." \
  -- negate allowed "$a_other"

crit_all_passed || evidence "$(crit_why)"
report "least privilege enforced"
