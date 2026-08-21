#!/usr/bin/env bash
# points: 4
# desc: the report container runs as uid 1000, non-root, no privilege escalation, no capabilities, RuntimeDefault seccomp
# expected: securitycontext.json json
set -uo pipefail
. /banks/_lib/checks.sh

tmpl='.spec.template.spec'
# Single-quoted on purpose. This whole expression already sits inside
# "$( ... )", so a \" here would be unescaped by that outer layer into a real
# quote, end the jq program early, and leave jq's {…} to bash — which brace-
# expands it into two broken programs. The path is spelled out rather than
# interpolated from $tmpl for the same reason.
snapshot() {
  kubectl -n auriga get deploy report-runner -o json 2>/dev/null \
    | jq -S --arg c report '
        (first(.spec.template.spec.containers[]? | select(.name == $c)) // null) as $ctr
        | if $ctr == null
          then {"no such container": $c, "containers that exist": [.spec.template.spec.containers[].name]}
          else
            ($ctr.securityContext // {}) as $csc
            | (.spec.template.spec.securityContext // {}) as $psc
            | {
                runAsUser: ($csc.runAsUser // $psc.runAsUser // null),
                runAsNonRoot: ($csc.runAsNonRoot // $psc.runAsNonRoot // null),
                allowPrivilegeEscalation: ($csc.allowPrivilegeEscalation // null),
                capabilities: {drop: (($csc.capabilities.drop // []) | sort)},
                seccompProfile: {type: ($csc.seccompProfile.type // $psc.seccompProfile.type // null)}
              }
          end' 2>/dev/null
}

evidence() {
  show_pair json securitycontext.json
  show_why "$1"
}

names=$(kubectl -n auriga get deploy report-runner -o jsonpath="{${tmpl}.containers[*].name}" 2>/dev/null)
has_name "$names" report || {
  echo "deployment report-runner has no container named 'report' (found: $(name_list "$names"))"
  evidence "The question asks the container to keep the name 'report' it had as a bare Pod. Every securityContext field below is read off that name, so under a different one they are not consulted and each reads back empty."
  exit 1
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

drop=$(kubectl -n auriga get deploy report-runner -o json 2>/dev/null \
  | jq -r "${tmpl}.containers[] | select(.name == \"report\") | .securityContext.capabilities.drop // [] | join(\",\")")
drops_all() { case ",${drop}," in *,ALL,*) return 0 ;; esac; return 1; }

# Five separate settings. All-or-nothing here meant one missing field — five of
# the six right, the Deployment rolled out and Ready — scored the same as a
# container still running as root with every default privilege.
#
# Where a field may sit on either the Pod or the container securityContext this
# check reads both, so an EXPECTED pane showing an empty pod block records where
# the reference solution happened to put it, not where it has to go.
crit 1 "runs as uid 1000" \
  "runAsUser='$(get runAsUser)', want 1000" \
  "runAsUser is the UID the container's process runs as, overriding whatever USER the image was built with. busybox declares none, so without this the process is root — which is the state the question is asking to leave." \
  -- [ "$(get runAsUser)" = "1000" ]

crit 1 "refuses to start as root" \
  "runAsNonRoot='$(get runAsNonRoot)', want true" \
  "runAsUser TELLS the kubelet which UID to use; runAsNonRoot: true makes it REFUSE to start a container that would end up as UID 0 anyway. Intent and enforcement — an image rebuilt tomorrow with USER root is caught by the second and not by the first." \
  -- [ "$(get runAsNonRoot)" = "true" ]

crit 1 "cannot gain more privileges" \
  "allowPrivilegeEscalation='$(container_only allowPrivilegeEscalation)', want false" \
  "allowPrivilegeEscalation controls the no_new_privs bit: with it false, no setuid binary inside the container can hand the process more privilege than it started with. It is a container-level field only — the API rejects it on the Pod securityContext, which is how you find out immediately." \
  -- [ "$(container_only allowPrivilegeEscalation)" = "false" ]

crit 1 "drops all Linux capabilities" \
  "capabilities dropped are '${drop}', want ALL" \
  "A container starts with a default set of Linux capabilities it almost never uses. Dropping ALL removes the lot, and anything genuinely needed is added back one name at a time under capabilities.add — which is the point: an explicit short list rather than an implicit long one." \
  -- drops_all

crit 1 "runs under the runtime's default seccomp profile" \
  "seccompProfile.type='$(get seccompProfile.type)', want RuntimeDefault" \
  "seccomp filters which SYSTEM CALLS the kernel will accept from the container, which is a different boundary from capabilities: capabilities decide what a privileged call may do, seccomp decides whether the call is allowed at all. RuntimeDefault asks for the container runtime's own profile rather than an Unconfined one, and is the setting Pod Security's baseline and restricted levels both expect." \
  -- [ "$(get seccompProfile.type)" = "RuntimeDefault" ]

crit_all_passed || evidence "$(crit_why)"
report "hardening ok"
