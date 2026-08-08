#!/usr/bin/env bash
# points: 2
# desc: StatefulSet ledger runs 2 replicas governed by the headless Service ledger
set -uo pipefail
. /banks/_lib/checks.sh

sts=$(kubectl -n cepheus get statefulset ledger -o json 2>/dev/null \
  | jq '{replicas: .spec.replicas, serviceName: .spec.serviceName, selector: .spec.selector.matchLabels}')
svc=$(kubectl -n cepheus get svc ledger -o json 2>/dev/null \
  | jq '{clusterIP: .spec.clusterIP, selector: .spec.selector}')

evidence() {
  show_actual json "$(jq -n --argjson sts "${sts:-null}" --argjson svc "${svc:-null}" \
    '{"statefulset ledger": $sts, "service ledger": $svc}' 2>/dev/null)"
  show_why "$1"
}

# The workload existing at all is the gate: a Deployment of the same name mounts
# one shared claim, which is the answer this question exists to rule out.
have=$(kubectl -n cepheus get statefulset ledger -o jsonpath='{.metadata.name}' 2>/dev/null)
[ -n "$have" ] || {
  echo "no StatefulSet named 'ledger' in namespace cepheus (statefulsets found: $(name_list "$(kubectl -n cepheus get statefulset -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)"))"
  show_actual text "$(kubectl -n cepheus get statefulset,deploy,pod 2>&1)"
  show_why "Only a StatefulSet gives each replica storage of its own. A Deployment points every replica at whichever claim its Pod template names, so scaling it hands the same volume to all of them — and with a ReadWriteOnce claim the extra replicas cannot even mount it."
  exit 1
}

replicas=$(kubectl -n cepheus get statefulset ledger -o jsonpath='{.spec.replicas}' 2>/dev/null)
svcname=$(kubectl -n cepheus get statefulset ledger -o jsonpath='{.spec.serviceName}' 2>/dev/null)
clusterip=$(kubectl -n cepheus get svc ledger -o jsonpath='{.spec.clusterIP}' 2>/dev/null)

crit 1 "2 replicas" \
  "spec.replicas is '$replicas', want 2" \
  "Two replicas is what makes the storage question visible: one claim would prove nothing, and the ordinals only start to matter once there is more than one of them." \
  -- [ "$replicas" = "2" ]

crit 1 "governed by Service ledger" \
  "spec.serviceName is '$svcname', want ledger" \
  "serviceName names the Service that governs the set. It is a required field on a StatefulSet and it is not a selector — the Service still finds Pods by label. Getting it wrong costs nothing at creation time and everything later, which is why it is worth checking rather than assuming." \
  -- [ "$svcname" = "ledger" ]

crit 1 "that Service is headless" \
  "service ledger has clusterIP '$clusterip', want None" \
  "A headless Service is one created with clusterIP: None. It allocates no virtual address and does no load balancing, which is the point when the replicas are not interchangeable. Leave the field out and the Service gets an address, and it stops being headless." \
  -- [ "$clusterip" = "None" ]

crit_all_passed || evidence "$(crit_why)"
report "statefulset and its governing service ok"
