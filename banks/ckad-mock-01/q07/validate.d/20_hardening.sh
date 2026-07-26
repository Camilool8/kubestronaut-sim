#!/usr/bin/env bash
# points: 3
# desc: no privilege escalation, read-only root filesystem, all capabilities dropped
set -uo pipefail
sel='{.spec.containers[?(@.name=="agent")].securityContext'
esc=$(kubectl -n cygnus get pod vault-agent -o jsonpath="${sel}.allowPrivilegeEscalation}" 2>/dev/null)
ro=$(kubectl -n cygnus get pod vault-agent -o jsonpath="${sel}.readOnlyRootFilesystem}" 2>/dev/null)
drops=$(kubectl -n cygnus get pod vault-agent -o jsonpath="${sel}.capabilities.drop[*]}" 2>/dev/null)

[ "$esc" = "false" ] || { echo "allowPrivilegeEscalation='$esc', want false"; exit 1; }
[ "$ro" = "true" ] || { echo "readOnlyRootFilesystem='$ro', want true"; exit 1; }
# ALL is the canonical spelling; "all" is not accepted by the API.
printf '%s' "$drops" | grep -qw ALL || { echo "capabilities.drop is '$drops', want ALL"; exit 1; }
echo "hardening ok"
