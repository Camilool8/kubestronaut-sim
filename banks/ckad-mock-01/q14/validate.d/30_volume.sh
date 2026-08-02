#!/usr/bin/env bash
# points: 2
# desc: api-keys mounted read-only at /etc/api with defaultMode 0400
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual json "$(kubectl -n tucana get deploy ledger-api -o json 2>/dev/null | jq '.spec.template.spec | {volumes, mounts: [.containers[] | {name, volumeMounts}]}')"
  show_why "$1"
}

src=$(kubectl -n tucana get deploy ledger-api \
  -o jsonpath='{.spec.template.spec.volumes[?(@.name=="api-keys")].secret.secretName}' 2>/dev/null)
[ "$src" = "api-keys" ] || {
  echo "volume 'api-keys' is not backed by Secret api-keys (got '$src')"
  evidence "A volume of kind secret names the Secret in secretName; the volume's own name is only a handle the container's mount refers to, and the two being spelled the same here is a convenience rather than a rule. Each key in the Secret becomes one file in the mounted directory."
  exit 1
}

# The API stores file modes as decimal, so 0400 comes back as 256. Both
# spellings are the same value and a candidate may legitimately have
# written either.
mode=$(kubectl -n tucana get deploy ledger-api \
  -o jsonpath='{.spec.template.spec.volumes[?(@.name=="api-keys")].secret.defaultMode}' 2>/dev/null)
[ "$mode" = "256" ] || {
  echo "defaultMode is '$mode', want 256 (0400)"
  evidence "File modes are octal and the API stores the decimal number that octal means, so 0400 is read back as 256 — the same value, and both spellings are accepted on the way in. The leading zero is what makes it octal: write 400 and you have asked for decimal 400, which is not a valid mode at all."
  exit 1
}

path=$(kubectl -n tucana get deploy ledger-api \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].volumeMounts[?(@.name=="api-keys")].mountPath}' 2>/dev/null)
ro=$(kubectl -n tucana get deploy ledger-api \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].volumeMounts[?(@.name=="api-keys")].readOnly}' 2>/dev/null)
[ "$path" = "/etc/api" ] || {
  echo "mountPath is '$path', want /etc/api"
  evidence "mountPath is the directory in which the Secret's keys appear as files, and mounting over a directory hides whatever the image had there. Declaring the volume on the Pod template and mounting it in the container are two separate steps."
  exit 1
}
[ "$ro" = "true" ] && echo "secret volume ok" || {
  echo "mount is not readOnly (got '$ro')"
  evidence "readOnly on the mount is asked for explicitly, and for a Secret it is the sensible default: the kubelet refreshes projected contents, so a local write would be discarded anyway, and credentials are not something a compromised process should be able to rewrite in place."
  exit 1
}
