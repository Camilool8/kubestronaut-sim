#!/usr/bin/env bash
# points: 3
# desc: no privilege escalation, read-only root filesystem, all capabilities dropped
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual json "$(kubectl -n cygnus get pod vault-agent -o json 2>/dev/null | jq '.spec.containers[] | select(.name == "agent") | .securityContext')"
  show_expected json "/banks/${BANK:-ckad-mock-01}/q07/expected/securitycontext.json"
  show_why "$1"
}

sel='{.spec.containers[?(@.name=="agent")].securityContext'
esc=$(kubectl -n cygnus get pod vault-agent -o jsonpath="${sel}.allowPrivilegeEscalation}" 2>/dev/null)
ro=$(kubectl -n cygnus get pod vault-agent -o jsonpath="${sel}.readOnlyRootFilesystem}" 2>/dev/null)
drops=$(kubectl -n cygnus get pod vault-agent -o jsonpath="${sel}.capabilities.drop[*]}" 2>/dev/null)

[ "$esc" = "false" ] || {
  echo "allowPrivilegeEscalation='$esc', want false"
  evidence "This sets the kernel's no_new_privs bit, so no process in the container can end up with more privilege than the one that started it — a setuid binary inside the image stops being a way up. It exists ONLY on the container securityContext; written at Pod level the API rejects it, which is the usual reason it is missing here."
  exit 1
}
[ "$ro" = "true" ] || {
  echo "readOnlyRootFilesystem='$ro', want true"
  evidence "This mounts the container's own filesystem read-only, so an intruder cannot drop a binary into it and the image cannot be modified at runtime. Container-level only, like the two beside it. An image that needs a writable path gets an emptyDir mounted over exactly that path rather than the whole root filesystem back."
  exit 1
}
printf '%s' "$drops" | grep -qw ALL || {
  echo "capabilities.drop is '$drops', want ALL"
  evidence "Linux capabilities are root's powers split into pieces, and a container gets a default set even when it is not running as root. Dropping ALL leaves it none, which is the baseline a hardened workload starts from before adding back anything it genuinely needs. ALL is spelled in capitals; the API does not accept 'all'."
  exit 1
}
echo "hardening ok"
