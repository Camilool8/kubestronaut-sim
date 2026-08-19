# This library is sourced, never executed, so it rightly has no shebang. Tell
# ShellCheck the dialect it would otherwise have read from one.
# shellcheck shell=bash
#
# Aux-cluster helper, sourced at /banks/_lib/aux.sh inside k8s-env — by the
# setup.sh of any question that starts from a broken control plane (q05 sched,
# q12 cni, q13 upgrade, q26 etcd), and by the conductor's reset flow. Each aux
# cluster is a one-node kind cluster in the same inner dockerd as the main
# `sim` cluster, with root sshd on a reserved host port and its kubeconfig
# published to /shared for the instances. Everything here is idempotent: a
# setup.sh re-run (re-seed, resume, retry after a part-failed cold run) must
# converge, not fail — and both the cold and the warm path have to fit the
# 240s per-question seed budget.
#
# API (frozen by the CKA contract; nobody invents an identifier):
#   aux_up <name> [--config <file>] [--image <ref>] [--ssh-port <port>]
#   aux_delete_all

# The one-minor-older node image for q13 (`aux_up upgrade --image
# "$AUX_NODE_IMAGE"`). Tag-only: the digest-pinned ref lives in the k8s-env
# Dockerfile, but the inner dockerd keys the imported image by its tag.
AUX_NODE_IMAGE=$(cat /opt/sim/aux-node-image 2>/dev/null || true)
AUX_NODE_IMAGE=${AUX_NODE_IMAGE%%@*}
export AUX_NODE_IMAGE

# /shared writes are atomic (tmp + mv): in hosted mode a single Pod has no
# compose ordering to hide a torn write from a concurrent reader.
_aux_write_shared() {
  cat > "$1.tmp" && mv "$1.tmp" "$1"
}

# The reserved ssh ports from the contract's port table. A name outside the
# table needs an explicit --ssh-port.
_aux_default_ssh_port() {
  case "$1" in
    sched) printf '2211' ;;
    cni) printf '2212' ;;
    upgrade) printf '2213' ;;
    etcd) printf '2214' ;;
  esac
}

_aux_archive_for() {
  local path
  path="/opt/sim/images/$(printf '%s' "$1" | tr '/:@' '___').tar"
  if [ -f "$path" ]; then
    printf '%s' "$path"
  fi
}

# Twin of import_node_tar in images/k8s-env/start.sh: the baked node tars are
# rootfs exports, so `docker import` rebuilds the image and the .changes file
# restores the config a rootfs tar cannot carry.
_aux_import_node_tar() {
  local tar=$1 ref=$2 line
  local args=()
  while IFS= read -r line; do
    if [ -n "$line" ]; then args+=(--change "$line"); fi
  done < "${tar}.changes"
  docker import "${args[@]}" "$tar" "$ref" >/dev/null
}

# The default node image is imported by start.sh before any bank boots; only
# the v1.34 aux tar is imported lazily, here, the first time a question asks
# for it — no bank but CKA pays its load time.
_aux_ensure_node_image() {
  local ref=$1 baked
  if docker image inspect "$ref" >/dev/null 2>&1; then
    return 0
  fi
  baked=$(cat /opt/sim/aux-node-image 2>/dev/null || true)
  if [ "$ref" = "${baked%%@*}" ] && [ -f /opt/sim/images/_aux_node.tar ]; then
    echo "importing the ${ref} node image"
    _aux_import_node_tar /opt/sim/images/_aux_node.tar "$ref"
    return 0
  fi
  docker pull "$ref"
}

# Is the image already in the cluster node's containerd store? Loading is the
# expensive half, so a warm re-run checks first. containerd normalizes bare
# refs under docker.io/, hence the second form.
_aux_node_has_image() {
  local cluster=$1 img=$2 node out
  node=$(kind get nodes --name "$cluster" 2>/dev/null | head -1)
  [ -n "$node" ] || return 1
  out=$(docker exec "$node" ctr -n k8s.io images ls -q 2>/dev/null || true)
  printf '%s\n' "$out" | grep -qx -- "$img" && return 0
  printf '%s\n' "$out" | grep -qx -- "docker.io/${img}"
}

# Load one image into a named aux cluster, preferring the archives baked into
# /opt/sim/images (mirrors load_image in bootstrap.sh, which is pinned to the
# main cluster).
_aux_load_image() {
  local cluster=$1 img=$2 archive
  archive=$(_aux_archive_for "$img")
  if [ -n "$archive" ]; then
    kind load image-archive --name "$cluster" "$archive" >/dev/null
    return
  fi
  if ! docker image inspect "$img" >/dev/null 2>&1; then
    docker pull "$img"
  fi
  kind load docker-image --name "$cluster" "$img" >/dev/null
}

_aux_stage_manifest_images() {
  local cluster=$1 manifest=$2 img
  for img in $(yq -r '[.. | select(has("image")) | .image] | .[]' "$manifest" | sort -u); do
    if ! _aux_node_has_image "$cluster" "$img"; then
      _aux_load_image "$cluster" "$img"
    fi
  done
}

_aux_stage_listed_images() {
  local cluster=$1 list=$2 img
  while read -r img; do
    case "$img" in ''|\#*) continue ;; esac
    if ! _aux_node_has_image "$cluster" "$img"; then
      _aux_load_image "$cluster" "$img"
    fi
  done < "$list"
}

aux_up() {
  local name=${1:?aux_up: cluster name required (sched, cni, upgrade, etcd)}
  shift
  local config="" image="" ssh_port=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --config) config=${2:?aux_up: --config needs a file}; shift 2 ;;
      --image) image=${2:?aux_up: --image needs a ref}; shift 2 ;;
      --ssh-port) ssh_port=${2:?aux_up: --ssh-port needs a port}; shift 2 ;;
      *) echo "aux_up: unknown option '$1'" >&2; return 2 ;;
    esac
  done
  if [ -z "$ssh_port" ]; then
    ssh_port=$(_aux_default_ssh_port "$name")
  fi
  if [ -z "$ssh_port" ]; then
    echo "aux_up: no reserved ssh port for '${name}'; pass --ssh-port" >&2
    return 2
  fi
  # The API port rides a fixed offset from the ssh port so every aux cluster
  # gets a deterministic, collision-free pair: 2211-2214 -> 6451-6454.
  local cluster="aux-${name}" api_port=$((ssh_port + 4240)) node
  if [ -z "$image" ]; then
    image=$(cat /opt/sim/node-image)
    image=${image%%@*}
  fi

  if ! kind get clusters 2>/dev/null | grep -qx "$cluster"; then
    _aux_ensure_node_image "$image"
    local cfg="/tmp/aux-config-${name}.yaml"
    if [ -n "$config" ]; then
      cp "$config" "$cfg"
    else
      printf 'kind: Cluster\napiVersion: kind.x-k8s.io/v1alpha4\n' > "$cfg"
    fi
    # The helper owns the wiring a question config never mentions: a node list
    # if none was given, the sshd port mapping, the API endpoint the instances
    # will dial, and a cert SAN for the k8s-env hostname they dial it by.
    api_port="$api_port" ssh_port="$ssh_port" yq -i '
      .nodes = (.nodes // [{"role": "control-plane"}]) |
      .networking.apiServerAddress = "0.0.0.0" |
      .networking.apiServerPort = env(api_port) |
      .nodes[0].extraPortMappings = ((.nodes[0].extraPortMappings // []) +
        [{"containerPort": 22, "hostPort": env(ssh_port), "protocol": "TCP"}]) |
      .kubeadmConfigPatches = ((.kubeadmConfigPatches // []) +
        ["kind: ClusterConfiguration\napiServer:\n  certSANs:\n    - \"k8s-env\"\n    - \"localhost\"\n    - \"127.0.0.1\"\n"])
    ' "$cfg"
    echo "creating the ${cluster} cluster"
    kind create cluster --name "$cluster" --config "$cfg" --image "$image"
    rm -f "$cfg"
  else
    # Warm path. kind lists clusters by container, running or not; after an
    # inner-dockerd restart a node that did not come back on its own gets a
    # nudge rather than a failure.
    for node in $(kind get nodes --name "$cluster" 2>/dev/null || true); do
      if [ "$(docker inspect -f '{{.State.Running}}' "$node" 2>/dev/null)" != "true" ]; then
        docker start "$node" >/dev/null
      fi
    done
  fi

  # Staged images, checked on cold AND warm runs so a retry after a
  # part-failed cold run still converges. A CNI-less cluster (q12) gets the
  # Calico images its candidate will install — kind load needs no CNI. The
  # upgrade cluster (q13) gets the v1.35 control-plane images kubeadm will
  # want, so the upgrade never reaches for the network.
  if [ -n "$config" ] && [ "$(yq -r '.networking.disableDefaultCNI // false' "$config")" = "true" ]; then
    _aux_stage_manifest_images "$cluster" /opt/sim/calico.yaml
  fi
  if [ "$name" = "upgrade" ] && [ -f /opt/sim/upgrade-images.txt ]; then
    _aux_stage_listed_images "$cluster" /opt/sim/upgrade-images.txt
  fi

  kind get kubeconfig --name "$cluster" \
    | sed "s#https://0\\.0\\.0\\.0:${api_port}#https://k8s-env:${api_port}#" \
    | _aux_write_shared "/shared/kubeconfig-aux-${name}"

  # Same key as every other node; overwriting keeps it idempotent. Twin loop
  # in bootstrap.sh for the main cluster.
  for node in $(kind get nodes --name "$cluster"); do
    docker exec -i "$node" sh -c \
      'mkdir -p /root/.ssh && cat > /root/.ssh/authorized_keys && chmod 700 /root/.ssh && chmod 600 /root/.ssh/authorized_keys' \
      < /shared/ssh/id_ed25519.pub
  done

  # Readiness. The API server first: the published kubeconfig cannot be used
  # from here (k8s-env's own name may not resolve to itself in every session
  # shape), so dial the 0.0.0.0 form kind emits, which connects locally.
  # NotReady *nodes* are fine — q12's whole premise is a node with no CNI —
  # but /readyz answers CNI or not.
  local deadline
  deadline=$(( $(date +%s) + 180 ))
  kind get kubeconfig --name "$cluster" > "/tmp/aux-${name}.kubeconfig"
  until kubectl --kubeconfig "/tmp/aux-${name}.kubeconfig" get --raw /readyz >/dev/null 2>&1; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "aux_up: ${cluster} API server not ready within 180s" >&2
      return 1
    fi
    sleep 2
  done

  # Then the contract's reachability promise: root ssh on the reserved port.
  deadline=$(( $(date +%s) + 120 ))
  until ssh -i /shared/ssh/id_ed25519 -p "$ssh_port" \
      -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
      -o ConnectTimeout=3 -o LogLevel=ERROR root@127.0.0.1 true 2>/dev/null; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "aux_up: ${cluster} sshd not reachable on port ${ssh_port} within 120s" >&2
      return 1
    fi
    sleep 2
  done

  echo "aux_up: ${cluster} ready (ssh :${ssh_port}, api :${api_port})"
}

# Used by the conductor's reset flow before it deletes the main cluster; must
# be a quiet no-op when nothing aux exists.
aux_delete_all() {
  local c
  for c in $(kind get clusters 2>/dev/null | grep '^aux-' || true); do
    echo "deleting the ${c} cluster"
    kind delete cluster --name "$c"
  done
  rm -f /shared/kubeconfig-aux-*
}
