#!/usr/bin/env bash
set -euo pipefail

# q12 runs on its own auxiliary kind cluster, aux-cni, created WITHOUT a pod
# network: that is the whole premise, so nothing here may leave one behind.
. /banks/_lib/aux.sh

CLUSTER=aux-cni
NS=q12-probe
IMAGE=busybox:1.37
CFG=/tmp/q12-aux-cni-config.yaml
# The published kubeconfig at /shared/kubeconfig-aux-cni points at
# https://k8s-env:6452, and k8s-env's own name does not resolve to itself in
# every session shape — so seeding dials the 0.0.0.0 form kind emits, exactly
# as aux_up's own readiness probe does.
KCFG=/tmp/q12-aux-cni.kubeconfig

kaux() { kubectl --kubeconfig "$KCFG" "$@"; }

# disableDefaultCNI is what aux_up reads to decide whether to stage the Calico
# images into the cluster's containerd, so the candidate's apply never reaches
# for the network. podSubnet is kind's own default and is written out because
# the staged manifest's IPv4 pool is patched to match it at image-build time;
# pinning it here means a kind default that moves fails loudly at seed rather
# than quietly at grade time.
cat > "$CFG" <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
networking:
  disableDefaultCNI: true
  podSubnet: "10.244.0.0/16"
EOF

aux_up cni --config "$CFG" --ssh-port 2212
kind get kubeconfig --name "$CLUSTER" > "$KCFG"

# ---------------------------------------------------------------- re-breaking
#
# aux_up undoes nothing: a cluster that survives from an earlier session, or a
# Training-mode re-seed of a question somebody already solved, comes back with
# the plugin still installed and every criterion here already true — free points
# and a failed "fresh env should score 0".
#
# There is no cheap way back. Deleting the manifest's objects leaves the CNI
# config file the install-cni container wrote on the node's disk, and a node
# with a CNI config is Ready whether or not anything is left to answer for it,
# so the question would open half-solved with its first criterion passing. The
# aux cluster belongs to this question alone, so the honest reset is to build it
# again — guarded by a read of the actual state, so the ordinary warm re-run
# (nothing installed yet) still costs seconds.
ready=$(kaux --request-timeout=10s get nodes \
  -o jsonpath='{range .items[*]}{range .status.conditions[?(@.type=="Ready")]}{.status}{"\n"}{end}{end}' \
  2>/dev/null || true)
# Any DaemonSet in kube-system that is not kube-proxy is a network plugin
# somebody installed: a pristine CNI-less kind cluster carries kube-proxy and
# nothing else. This also catches a half-finished install, which would leave the
# node NotReady but the cluster in a state no candidate should be handed.
plugins=$(kaux --request-timeout=10s -n kube-system get daemonset \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null \
  | grep -v '^kube-proxy$' | grep -v '^$' || true)

if printf '%s' "$ready" | grep -q True || [ -n "$plugins" ]; then
  echo "q12 setup: ${CLUSTER} already has a pod network — rebuilding it without one"
  # --kubeconfig for the same reason aux_up passes it on create: the seed job
  # runs every drawn question's setup.sh in one shell, and kind's delete
  # otherwise reaches into root's ambient kubeconfig to prune a context.
  kind delete cluster --name "$CLUSTER" --kubeconfig "$KCFG"
  aux_up cni --config "$CFG" --ssh-port 2212
  kind get kubeconfig --name "$CLUSTER" > "$KCFG"
fi

# --------------------------------------------------------------- the workload
#
# An aux cluster's containerd holds the Kubernetes control-plane images and the
# Calico images aux_up staged, and nothing else — so the probe image goes in
# now rather than being left to a pull that this question must not depend on.
# Three Pods stuck in ImagePullBackOff would look exactly like a CNI that did
# not work, and would grade like one too.
if ! _aux_node_has_image "$CLUSTER" "$IMAGE"; then
  _aux_load_image "$CLUSTER" "$IMAGE"
fi

kaux create ns "$NS" --dry-run=client -o yaml | kaux apply -f -

# The policy is the instrument, and it is seeded rather than asked for: this
# question is about installing a plugin that ENFORCES it. A previous attempt
# could have left another policy in the Namespace, which would change what the
# probes below are allowed to see, so the Namespace's policy set is reset to
# exactly the one this question ships. q12-probe belongs to this question alone,
# on a cluster that belongs to it alone, so --all reaches nothing else.
kaux -n "$NS" delete networkpolicy --all --ignore-not-found >/dev/null 2>&1 || true

# Nothing here has a probe and nothing waits for a rollout: at seed the node is
# NotReady and carries node.kubernetes.io/not-ready with BOTH NoSchedule and
# NoExecute, so all three Pods sit Pending and unassigned. That is the state the
# question opens in, and nothing here tolerates that taint — waiting on the
# candidate's work is the premise, and a Pod that landed anyway would only trade
# Pending for a sandbox that never gets an address.
#
# The control-plane toleration is a different taint and is deliberate. This is a
# one-node cluster, so the only place a Pod can ever go is the control-plane
# node; kind clears that taint for a single-node cluster today, and tolerating
# it costs nothing while the day it stops would otherwise leave this question
# unsolvable rather than merely unsolved.
kaux apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: $NS
spec:
  replicas: 1
  selector:
    matchLabels: {app: web}
  template:
    metadata:
      labels: {app: web}
    spec:
      tolerations:
        - key: node-role.kubernetes.io/control-plane
          operator: Exists
          effect: NoSchedule
      containers:
        - name: web
          image: $IMAGE
          command: ["sh", "-c"]
          args:
            - |
              mkdir -p /www
              echo web-ok > /www/index.html
              exec httpd -f -p 8080 -h /www
          ports: [{containerPort: 8080, name: http}]
          resources:
            requests: {cpu: 10m, memory: 16Mi}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: client
  namespace: $NS
spec:
  replicas: 1
  selector:
    matchLabels: {app: client}
  template:
    metadata:
      labels: {app: client}
    spec:
      tolerations:
        - key: node-role.kubernetes.io/control-plane
          operator: Exists
          effect: NoSchedule
      containers:
        - name: probe
          image: $IMAGE
          command: ["sh", "-c", "while true; do sleep 30; done"]
          resources:
            requests: {cpu: 10m, memory: 16Mi}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: outsider
  namespace: $NS
spec:
  replicas: 1
  selector:
    matchLabels: {app: outsider}
  template:
    metadata:
      labels: {app: outsider}
    spec:
      tolerations:
        - key: node-role.kubernetes.io/control-plane
          operator: Exists
          effect: NoSchedule
      containers:
        - name: probe
          image: $IMAGE
          command: ["sh", "-c", "while true; do sleep 30; done"]
          resources:
            requests: {cpu: 10m, memory: 16Mi}
---
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: $NS
spec:
  selector: {app: web}
  ports:
    - name: http
      port: 8080
      targetPort: 8080
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: web-allow-client
  namespace: $NS
spec:
  podSelector:
    matchLabels: {app: web}
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector:
            matchLabels: {app: client}
      ports:
        - {protocol: TCP, port: 8080}
EOF

echo "q12 setup: ${CLUSTER} is up with no pod network; ${NS} seeded and Pending"
