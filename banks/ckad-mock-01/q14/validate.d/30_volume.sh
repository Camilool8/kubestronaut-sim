#!/usr/bin/env bash
# points: 2
# desc: api-keys mounted read-only at /etc/api with defaultMode 0400
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual json "$(kubectl -n tucana get deploy ledger-api -o json 2>/dev/null | jq '.spec.template.spec | {volumes, mounts: [.containers[] | {name, volumeMounts}]}')"
  show_why "$1"
}

# Everything below is addressed by the names the question fixed — the volume
# 'api-keys' and the container 'api'. A name nothing matches reads back exactly
# like a field left unset, so name that as the cause instead.
vols=$(kubectl -n tucana get deploy ledger-api \
  -o jsonpath='{.spec.template.spec.volumes[*].name}' 2>/dev/null)
has_name "$vols" api-keys || {
  echo "deployment ledger-api has no volume named 'api-keys' (found: $(name_list "$vols"))"
  evidence "The question fixes the volume's name at 'api-keys', separately from the Secret it carries. Mounting the right Secret under a volume named something else is a working Pod, but this check looks the volume up by the name it was told to expect and finds nothing there — so secretName, defaultMode and the mount below all read back empty."
  exit 1
}

src=$(kubectl -n tucana get deploy ledger-api \
  -o jsonpath='{.spec.template.spec.volumes[?(@.name=="api-keys")].secret.secretName}' 2>/dev/null)
mode=$(kubectl -n tucana get deploy ledger-api \
  -o jsonpath='{.spec.template.spec.volumes[?(@.name=="api-keys")].secret.defaultMode}' 2>/dev/null)
path=$(kubectl -n tucana get deploy ledger-api \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].volumeMounts[?(@.name=="api-keys")].mountPath}' 2>/dev/null)
ro=$(kubectl -n tucana get deploy ledger-api \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].volumeMounts[?(@.name=="api-keys")].readOnly}' 2>/dev/null)

crit 1 "backed by Secret api-keys" \
  "volume 'api-keys' is not backed by Secret api-keys (got '$src')" \
  "A volume of kind secret names the Secret in secretName; the volume's own name is only a handle the container's mount refers to, and the two being spelled the same here is a convenience rather than a rule. Each key in the Secret becomes one file in the mounted directory." \
  -- [ "$src" = "api-keys" ]

crit 1 "projected in mode 0400" \
  "defaultMode is '$mode', want 256 (0400)" \
  "File modes are octal and the API stores the decimal number that octal means, so 0400 is read back as 256 — the same value, and both spellings are accepted on the way in. The leading zero is what makes it octal: write 400 and you have asked for decimal 400, which is not a valid mode at all." \
  -- [ "$mode" = "256" ]

crit 1 "mounted at /etc/api" \
  "mountPath is '$path', want /etc/api" \
  "mountPath is the directory in which the Secret's keys appear as files, and mounting over a directory hides whatever the image had there. Declaring the volume on the Pod template and mounting it in the container are two separate steps." \
  -- [ "$path" = "/etc/api" ]

crit 1 "mounted read-only" \
  "mount is not readOnly (got '$ro')" \
  "readOnly on the mount is asked for explicitly, and for a Secret it is the sensible default: the kubelet refreshes projected contents, so a local write would be discarded anyway, and credentials are not something a compromised process should be able to rewrite in place." \
  -- [ "$ro" = "true" ]

crit_all_passed || evidence "$(crit_why)"
report "secret volume ok"
