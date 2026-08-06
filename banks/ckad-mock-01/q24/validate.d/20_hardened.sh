#!/usr/bin/env bash
# points: 4
# desc: the report container runs as uid 1000, non-root, no privilege escalation, no capabilities, RuntimeDefault seccomp
set -uo pipefail
. /banks/_lib/checks.sh

tmpl='.spec.template.spec'
evidence() {
  show_actual json "$(kubectl -n auriga get deploy report-runner -o json 2>/dev/null \
    | jq "{pod: ${tmpl}.securityContext,
           container: (${tmpl}.containers[] | select(.name == \"report\") | .securityContext)}")"
  show_expected json "/banks/${BANK:-ckad-mock-01}/q24/expected/securitycontext.json"
  show_why "$1"
}

get() {
  local field=$1 v
  v=$(kubectl -n auriga get deploy report-runner \
    -o jsonpath="{${tmpl}.containers[?(@.name==\"report\")].securityContext.${field}}" 2>/dev/null)
  [ -n "$v" ] || v=$(kubectl -n auriga get deploy report-runner \
    -o jsonpath="{${tmpl}.securityContext.${field}}" 2>/dev/null)
  printf '%s' "$v"
}
container_only() {
  kubectl -n auriga get deploy report-runner \
    -o jsonpath="{${tmpl}.containers[?(@.name==\"report\")].securityContext.$1}" 2>/dev/null
}

[ "$(get runAsUser)" = "1000" ] || {
  echo "runAsUser='$(get runAsUser)', want 1000"
  evidence "runAsUser is the UID the container's process runs as, overriding whatever USER the image was built with. busybox declares none, so without this the process is root — which is the state the question is asking to leave. Either placement is a correct answer and this check reads both, so an EXPECTED pane showing an empty pod block records where the reference solution happened to put it — not where it has to go."
  exit 1
}
[ "$(get runAsNonRoot)" = "true" ] || {
  echo "runAsNonRoot='$(get runAsNonRoot)', want true"
  evidence "runAsUser TELLS the kubelet which UID to use; runAsNonRoot: true makes it REFUSE to start a container that would end up as UID 0 anyway. Intent and enforcement — an image rebuilt tomorrow with USER root is caught by the second and not by the first. Either placement is a correct answer and this check reads both, so an EXPECTED pane showing an empty pod block records where the reference solution happened to put it — not where it has to go."
  exit 1
}
[ "$(container_only allowPrivilegeEscalation)" = "false" ] || {
  echo "allowPrivilegeEscalation='$(container_only allowPrivilegeEscalation)', want false"
  evidence "allowPrivilegeEscalation controls the no_new_privs bit: with it false, no setuid binary inside the container can hand the process more privilege than it started with. It is a container-level field only — the API rejects it on the Pod securityContext, which is how you find out immediately."
  exit 1
}
drop=$(kubectl -n auriga get deploy report-runner -o json 2>/dev/null \
  | jq -r "${tmpl}.containers[] | select(.name == \"report\") | .securityContext.capabilities.drop // [] | join(\",\")")
case ",${drop}," in
  *,ALL,*) ;;
  *)
    echo "capabilities dropped are '${drop}', want ALL"
    evidence "A container starts with a default set of Linux capabilities it almost never uses. Dropping ALL removes the lot, and anything genuinely needed is added back one name at a time under capabilities.add — which is the point: an explicit short list rather than an implicit long one."
    exit 1 ;;
esac
[ "$(get seccompProfile.type)" = "RuntimeDefault" ] || {
  echo "seccompProfile.type='$(get seccompProfile.type)', want RuntimeDefault"
  evidence "seccomp filters which SYSTEM CALLS the kernel will accept from the container, which is a different boundary from capabilities: capabilities decide what a privileged call may do, seccomp decides whether the call is allowed at all. RuntimeDefault asks for the container runtime's own profile rather than an Unconfined one, and is the setting Pod Security's baseline and restricted levels both expect. Either placement is a correct answer and this check reads both, so an EXPECTED pane showing an empty pod block records where the reference solution happened to put it — not where it has to go."
  exit 1
}

echo "hardening ok"
