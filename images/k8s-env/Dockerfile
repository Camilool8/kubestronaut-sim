FROM docker:27-dind
ARG KIND_VERSION=v0.32.0
ARG KUBECTL_VERSION=v1.35.6
ARG HELM_VERSION=v3.18.0
ARG CALICO_VERSION=v3.32.1
ARG INGRESS_NGINX_VERSION=controller-v1.15.1
ARG NODE_IMAGE=kindest/node:v1.35.5@sha256:ce977ae6d65918d0b58a5f8b5e940429c2ce42fa3a5619ec2bbc60b949c0ac95
ENV NODE_IMAGE=${NODE_IMAGE}
# busybox-extras is here for exactly one applet: httpd, which serves the
# packaged Helm charts (see start.sh). Alpine's base busybox is built
# without it.
RUN apk add --no-cache bash curl jq yq openssh-client openssl busybox-extras
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

COPY kind-config.yaml bootstrap.sh /opt/sim/
COPY start.sh /start.sh
RUN chmod +x /start.sh /opt/sim/bootstrap.sh
ENTRYPOINT ["/start.sh"]
