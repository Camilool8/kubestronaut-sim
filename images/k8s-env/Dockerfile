FROM docker:27-dind AS sim
ARG KIND_VERSION=v0.32.0
ARG KUBECTL_VERSION=v1.35.6
ARG HELM_VERSION=v3.18.0
ARG CALICO_VERSION=v3.32.1
ARG INGRESS_NGINX_VERSION=controller-v1.15.1
ARG NODE_IMAGE=kindest/node:v1.35.5@sha256:ce977ae6d65918d0b58a5f8b5e940429c2ce42fa3a5619ec2bbc60b949c0ac95
ENV NODE_IMAGE=${NODE_IMAGE}
# The same constant again, as a file, because an ENV only reaches
# processes descended from PID 1. On a hosted reset the conductor re-runs
# bootstrap.sh over ssh (ENGINE=ssh) and an sshd session inherits none of
# the image's environment: the rebuild aborted at `set -u` with
# "NODE_IMAGE: unbound variable" — after it had already deleted the old
# cluster, so the session was left with no cluster at all. A build-time
# constant must not depend on how the script reading it was invoked.
RUN mkdir -p /opt/sim && printf '%s' "${NODE_IMAGE}" > /opt/sim/node-image
# busybox-extras is here for exactly one applet: httpd, which serves the
# packaged Helm charts (see start.sh). Alpine's base busybox is built
# without it.
# openssh-server, not just the client: the hosted deployment runs the
# whole stack as one Pod, where the conductor has no Docker socket and
# reaches this container over ssh instead (ENGINE=ssh). Idle and unused
# under compose, which never sets SSHD_LISTEN — see start.sh.
RUN apk add --no-cache bash curl jq yq openssh-client openssh-server openssl busybox-extras
RUN ARCH=$(uname -m); case "$ARCH" in x86_64) ARCH=amd64 ;; aarch64) ARCH=arm64 ;; esac \
    && curl -fsSL -o /usr/local/bin/kind "https://kind.sigs.k8s.io/dl/${KIND_VERSION}/kind-linux-${ARCH}" \
    && curl -fsSL -o /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${ARCH}/kubectl" \
    && curl -fsSL "https://get.helm.sh/helm-${HELM_VERSION}-linux-${ARCH}.tar.gz" | tar xz -C /tmp \
    && mv /tmp/linux-${ARCH}/helm /usr/local/bin/helm \
    && chmod +x /usr/local/bin/kind /usr/local/bin/kubectl /usr/local/bin/helm

# Cluster add-ons are vendored at build time, not fetched at bootstrap.
# A reset re-creates the cluster, so anything downloaded during bootstrap
# would be downloaded again on every single reset — and would make reset
# fail outright without a network. Baked in, plus the images pre-pulled
# into the persistent DinD cache, a reset needs nothing from the internet.

# Calico replaces kindnet (see kind-config.yaml). The only edit is the
# default IP pool, which upstream ships commented out at 192.168.0.0/16
# and which has to match this cluster's podSubnet. Both greps are the
# point: if a future CALICO_VERSION reformats these lines, the build fails
# loudly here instead of producing a cluster whose pod network silently
# does not match its CNI's IPAM.
RUN mkdir -p /opt/sim \
    && curl -fsSL -o /opt/sim/calico.yaml \
      "https://raw.githubusercontent.com/projectcalico/calico/${CALICO_VERSION}/manifests/calico.yaml" \
    && grep -q '# - name: CALICO_IPV4POOL_CIDR' /opt/sim/calico.yaml \
    && sed -i \
        -e 's|^\( *\)# - name: CALICO_IPV4POOL_CIDR|\1- name: CALICO_IPV4POOL_CIDR|' \
        -e 's|^\( *\)#   value: "192.168.0.0/16"|\1  value: "10.244.0.0/16"|' \
        /opt/sim/calico.yaml \
    && grep -q '^ *- name: CALICO_IPV4POOL_CIDR' /opt/sim/calico.yaml \
    && grep -q '^ *value: "10.244.0.0/16"' /opt/sim/calico.yaml

# ingress-nginx, kind provider (hostPort 80/443 rather than a LoadBalancer
# nobody can provision here). Two edits:
#
#  1. The controller is pinned to the control-plane node. Only that node
#     carries the extraPortMappings, and as of v1.15 the kind provider
#     manifest no longer ships the `ingress-ready` nodeSelector it used
#     to — it selects on OS alone, so a two-node cluster is free to put
#     the controller on the worker, where nothing is published.
#  2. Image digests are stripped. The images are pre-pulled into the DinD
#     cache and side-loaded into the nodes with `kind load`, which names
#     them by tag; a kubelet asked for tag@digest would ignore the loaded
#     copy and go to the network anyway, defeating the offline reset.
#     Version pinning survives via INGRESS_NGINX_VERSION and the vendored
#     manifest itself.
RUN curl -fsSL -o /opt/sim/ingress-nginx.yaml \
      "https://raw.githubusercontent.com/kubernetes/ingress-nginx/${INGRESS_NGINX_VERSION}/deploy/static/provider/kind/deploy.yaml" \
    && yq -i '(select(.kind == "Deployment" and .metadata.name == "ingress-nginx-controller") | .spec.template.spec.nodeSelector."ingress-ready") = "true"' \
        /opt/sim/ingress-nginx.yaml \
    && grep -q 'ingress-ready: "true"' /opt/sim/ingress-nginx.yaml \
    && sed -i 's|@sha256:[0-9a-f]\{64\}||g' /opt/sim/ingress-nginx.yaml \
    && ! grep -q '@sha256:' /opt/sim/ingress-nginx.yaml

COPY kind-config.yaml bootstrap.sh phase.sh preload.txt /opt/sim/
COPY start.sh /start.sh
RUN chmod +x /start.sh /opt/sim/bootstrap.sh

# Image archives, so a cold first boot is a disk copy instead of a
# download.
#
# The obvious approach — pre-pulling into the Docker cache — cannot work
# here: /var/lib/docker is a named volume, so anything baked at that path
# is masked the moment the container starts, and first boot pulls ~1.9GB
# inside DinD anyway. That is the single slowest and flakiest step of a
# first run, and it is why bootstrap.sh needs pull_retry at all.
#
# skopeo writes the same format `docker save` does and needs no daemon,
# which matters because a RUN cannot be privileged and so cannot host a
# nested dockerd. The add-on images are read out of the manifests
# vendored above rather than listed by hand, so bumping CALICO_VERSION or
# INGRESS_NGINX_VERSION cannot leave a stale list behind.
#
# Cost: roughly 2GB on this image. The byte count of a first run is close
# to a wash — you fetch it as image layers instead of as registry pulls —
# but layers are parallel, resumable and cached by the outer Docker,
# where the in-DinD pulls were serial and fragile. The real prize is that
# every reset after the first needs no network at all.
#
# Cross-arch note: skopeo without --override-arch follows the manifest
# list and docker-archive holds one platform, so this bakes the build
# host's. Correct for a local build; see docs/follow-ups.md on amd64.
FROM sim AS preload
ARG PRELOAD=full
RUN apk add --no-cache skopeo
RUN mkdir -p /out && \
    if [ "$PRELOAD" = "none" ]; then echo "prebaking disabled"; else \
      { yq -r '[.. | select(has("image")) | .image] | .[]' /opt/sim/calico.yaml; \
        yq -r '[.. | select(has("image")) | .image] | .[]' /opt/sim/ingress-nginx.yaml; \
        grep -v '^[[:space:]]*#' /opt/sim/preload.txt; } \
      | sed '/^[[:space:]]*$/d' | sort -u > /tmp/all.txt && \
      while read -r img; do \
        out=/out/$(printf '%s' "$img" | tr '/:@' '___').tar; \
        echo "baking $img"; \
        skopeo copy --retry-times 3 "docker://$img" "docker-archive:${out}:${img}"; \
      done < /tmp/all.txt; \
    fi
# The node image is loaded into the inner daemon rather than into a node
# (there is no node yet when `kind create cluster` runs), so it gets a
# fixed name start.sh can find without re-deriving the digest.
#
# Source and destination are derived separately because skopeo rejects a
# `repo:tag@digest` reference outright ("references with both a tag and
# digest are currently not supported"). So: pull by digest, which is
# where the supply-chain pinning actually lives, and write the archive
# under the plain tag, which is what a docker-archive can carry and what
# `kind create --image` must therefore be given.
RUN if [ "$PRELOAD" = "full" ]; then \
      ref="${NODE_IMAGE%%@*}"; \
      repo="${ref%:*}"; \
      digest="${NODE_IMAGE##*@}"; \
      skopeo copy --retry-times 3 "docker://${repo}@${digest}" "docker-archive:/out/_node.tar:${ref}"; \
    fi

FROM sim
COPY --from=preload /out /opt/sim/images
ENTRYPOINT ["/start.sh"]
