#!/usr/bin/env bash
# points: 4
# desc: status-page is a NodePort Service on port 80 with node port 30081
set -uo pipefail
. /banks/_lib/checks.sh

# Same reasoning as q19/10_service.sh, plus externalTrafficPolicy, which
# only appears once a Service becomes a NodePort and is defaulted to
# Cluster by the API server. spec.ports[].nodePort STAYS: the question
# pins it, so it is the answer rather than an allocation. clusterIP and
# clusterIPs are handled by k8s_clean itself. All five here are
# candidates for promotion — every Service capture in the bank wants
# them gone.
defaults='del(.spec.internalTrafficPolicy, .spec.externalTrafficPolicy,
              .spec.ipFamilies, .spec.ipFamilyPolicy, .spec.sessionAffinity)'
evidence() {
  show_actual yaml "$(kubectl -n aquila get svc status-page -o yaml 2>/dev/null | k8s_clean | yq "$defaults")"
  show_expected yaml "/banks/${BANK:-ckad-mock-01}/q20/expected/service.yaml"
  show_why "$1"
}

type=$(kubectl -n aquila get svc status-page -o jsonpath='{.spec.type}' 2>/dev/null)
[ "$type" = "NodePort" ] || {
  echo "type is '$type', want NodePort"
  evidence "A NodePort Service is a ClusterIP Service PLUS a port opened on every node — the cluster IP keeps working exactly as before and the node port is additional, which is why nothing inside the cluster notices the change. The type field is what opens it."
  exit 1
}

# The port entry is selected by its published port rather than by
# position: the question pins port 80 and node port 30081, so `port == 80`
# is the handle that says which entry is being asked about.
np=$(kubectl -n aquila get svc status-page \
  -o jsonpath='{.spec.ports[?(@.port==80)].nodePort}' 2>/dev/null)
[ -n "$np" ] || {
  echo "the Service publishes no port 80"
  evidence "port is what clients connect to on the Service, and the question keeps it at 80. Nothing in this Service publishes that port, so there is no entry for a node port to hang off — a Service's ports are a list and each entry carries port, targetPort and nodePort together."
  exit 1
}
[ "$np" = "30081" ] && echo "nodeport ok" || {
  echo "nodePort for port 80 is '$np', want 30081"
  evidence "Leave nodePort out and the cluster allocates one at random from its node-port range, which is normally what you want. Pinning it is for when something outside the cluster has the number written down — and pinning one already in use makes the Service rejected rather than silently moved."
  exit 1
}
