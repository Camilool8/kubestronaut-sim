#!/usr/bin/env bash
# points: 4
# desc: report-reader may read ConfigMaps in crater and may do nothing more
set -uo pipefail
. /banks/_lib/checks.sh

SUBJECT=system:serviceaccount:crater:report-reader

# One SubjectAccessReview each, asked up front so the messages can quote the
# answers. The first word is all of it: some versions append a reason.
answer() {
  kubectl auth can-i "$1" configmaps -n "$2" --as="$SUBJECT" 2>/dev/null \
    | head -1 | awk '{print $1}'
}
a_list=$(answer list crater)
a_get=$(answer get crater)
a_delete=$(answer delete crater)
a_archive=$(answer get crater-archive)

decided() {
  case $1 in
    yes|no) return 0 ;;
    *) return 1 ;;
  esac
}
for a in "$a_list" "$a_get" "$a_delete" "$a_archive"; do
  decided "$a" || {
    echo "the authorization queries returned no answer ('$a')"
    show_why "This check asks the API server, as that ServiceAccount, whether each action is permitted. Getting no answer at all is an environment fault rather than a wrong answer, so report it: nothing about the Role or the binding is being judged here."
    exit 1
  }
done

evidence() {
  show_actual text "$(kubectl auth can-i --list -n crater --as="$SUBJECT" 2>/dev/null)"
  show_why "$1"
}

allowed() { [ "$1" = "yes" ]; }

# can-i answers for a subject that was never created, and the legacy binding
# setup.sh plants already says yes to both reads — so on an untouched
# environment these two would score without anything having been done. An
# allowed read only counts once the account it names exists.
sa_exists() { kubectl -n crater get serviceaccount report-reader >/dev/null 2>&1; }
granted() { sa_exists && allowed "$1"; }

crit 1 "may list ConfigMaps in crater" \
  "listing ConfigMaps as report-reader answers '$a_list', want yes from an account that exists" \
  "The pane shows every rule that resolves for this ServiceAccount in crater. Nothing grants list on configmaps: either the Role does not carry the verb, or the RoleBinding never joined the Role to this subject — a Role with no binding grants nobody anything." \
  -- granted "$a_list"

crit 1 "may get a ConfigMap in crater" \
  "getting a ConfigMap as report-reader answers '$a_get', want yes from an account that exists" \
  "get and list are separate verbs on the same resource. Reading one object by name and enumerating them are different requests to the API server, and a Role that carries only one of the two is a common way for a workload to half-work." \
  -- granted "$a_get"

crit 1 "may NOT delete ConfigMaps in crater" \
  "deleting a ConfigMap in crater answers '$a_delete', want no" \
  "This is the half the question is really about. RBAC is purely additive and has no deny rule, so adding a narrow Role never takes away a wide grant already in force — the union of every binding naming this subject is what applies. Something still gives it write access, and it has to be removed rather than overridden. Asking can-i with --list is how you find what." \
  -- negate allowed "$a_delete"

crit 1 "may NOT read ConfigMaps in crater-archive" \
  "getting a ConfigMap in crater-archive answers '$a_archive', want no" \
  "A RoleBinding grants its Role's rules only inside its own Namespace, so a correct answer denies this without anything being written about crater-archive at all. An answer of yes means the grant is cluster-scoped somewhere — a ClusterRoleBinding reaches every Namespace at once." \
  -- negate allowed "$a_archive"

crit_all_passed || evidence "$(crit_why)"
report "least privilege enforced"
