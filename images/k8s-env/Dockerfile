# The node images are ARGs above the first FROM because two build stages derive
# from them. AUX_NODE_IMAGE is the one-minor-older image q13's kubeadm-upgrade
# aux cluster starts from; tests/check-k8s-pins.sh reads it by exactly this
# name — do not rename it. Both are digest-pinned; kind v0.32.0's release notes
# are the source of the digests.
ARG NODE_IMAGE=kindest/node:v1.35.5@sha256:ce977ae6d65918d0b58a5f8b5e940429c2ce42fa3a5619ec2bbc60b949c0ac95
ARG AUX_NODE_IMAGE=kindest/node:v1.34.8@sha256:02722c2dedddcfc00febf5d27fbeb9b7b2c14294c82109ff4a85d89ac9ba3256

FROM docker:27-dind AS sim
ARG NODE_IMAGE
ARG AUX_NODE_IMAGE
ARG KIND_VERSION=v0.32.0
ARG KUBECTL_VERSION=v1.35.6
ARG HELM_VERSION=v3.21.3
ARG CALICO_VERSION=v3.32.1
ARG INGRESS_NGINX_VERSION=controller-v1.15.1
# The gateway-api addon: nginx-gateway-fabric, its data-plane nginx image, and
# the Gateway API CRD release NGF pins (config/crd/gateway-api in the NGF repo
# at this tag references v1.5.1). Bump all four together.
ARG NGF_VERSION=2.6.7
ARG NGF_IMAGE=ghcr.io/nginx/nginx-gateway-fabric:2.6.7@sha256:1b5f8131482557bbcdcca9ad05984b4465bd6cc59db719e18bb26dad169cc30b
ARG NGF_NGINX_IMAGE=ghcr.io/nginx/nginx-gateway-fabric/nginx:2.6.7@sha256:65214232cf226e57195dbf49eb3d77e8d6e230c878448992cfcb43dfcd320ba6
ARG GATEWAY_API_VERSION=v1.5.1
ENV NODE_IMAGE=${NODE_IMAGE}
ENV AUX_NODE_IMAGE=${AUX_NODE_IMAGE}
RUN mkdir -p /opt/sim \
    && printf '%s' "${NODE_IMAGE}" > /opt/sim/node-image \
    && printf '%s' "${AUX_NODE_IMAGE}" > /opt/sim/aux-node-image \
    && printf '%s\n%s\n' "${NGF_IMAGE}" "${NGF_NGINX_IMAGE}" > /opt/sim/gateway-images.txt
RUN apk add --no-cache bash curl jq yq openssh-client openssh-server openssl busybox-extras
RUN ARCH=$(uname -m); case "$ARCH" in x86_64) ARCH=amd64 ;; aarch64) ARCH=arm64 ;; esac \
    && curl -fsSL -o /usr/local/bin/kind "https://kind.sigs.k8s.io/dl/${KIND_VERSION}/kind-linux-${ARCH}" \
    && curl -fsSL -o /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${ARCH}/kubectl" \
    && curl -fsSL "https://get.helm.sh/helm-${HELM_VERSION}-linux-${ARCH}.tar.gz" | tar xz -C /tmp \
    && mv /tmp/linux-${ARCH}/helm /usr/local/bin/helm \
    && chmod +x /usr/local/bin/kind /usr/local/bin/kubectl /usr/local/bin/helm

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

RUN curl -fsSL -o /opt/sim/ingress-nginx.yaml \
      "https://raw.githubusercontent.com/kubernetes/ingress-nginx/${INGRESS_NGINX_VERSION}/deploy/static/provider/kind/deploy.yaml" \
    && yq -i '(select(.kind == "Deployment" and .metadata.name == "ingress-nginx-controller") | .spec.template.spec.nodeSelector."ingress-ready") = "true"' \
        /opt/sim/ingress-nginx.yaml \
    && grep -q 'ingress-ready: "true"' /opt/sim/ingress-nginx.yaml \
    && sed -i 's|@sha256:[0-9a-f]\{64\}||g' /opt/sim/ingress-nginx.yaml \
    && ! grep -q '@sha256:' /opt/sim/ingress-nginx.yaml

# The gateway-api addon manifests, staged at build time like Calico so a boot
# never reaches the network. Three patches, each verified so a drifted upstream
# manifest fails the build and not the exam:
#   - the GatewayClass ships as `nginx`; the bank contract names it `sim`, so
#     both the object and the controller's --gatewayclass flag are renamed
#   - the data-plane Service ships as LoadBalancer, which never provisions on
#     kind; ClusterIP is what the behavioral graders curl. externalTrafficPolicy
#     is only valid for NodePort/LoadBalancer, so it must go with it.
RUN curl -fsSL -o /opt/sim/gateway-api-crds.yaml \
      "https://github.com/kubernetes-sigs/gateway-api/releases/download/${GATEWAY_API_VERSION}/standard-install.yaml" \
    && curl -fsSL -o /opt/sim/ngf-crds.yaml \
      "https://raw.githubusercontent.com/nginx/nginx-gateway-fabric/v${NGF_VERSION}/deploy/crds.yaml" \
    && curl -fsSL -o /opt/sim/ngf.yaml \
      "https://raw.githubusercontent.com/nginx/nginx-gateway-fabric/v${NGF_VERSION}/deploy/default/deploy.yaml" \
    && grep -q "nginx-gateway-fabric:${NGF_VERSION}" /opt/sim/ngf.yaml \
    && grep -q 'gatewayclasses.gateway.networking.k8s.io' /opt/sim/gateway-api-crds.yaml \
    && yq -i '(select(.kind == "GatewayClass" and .metadata.name == "nginx") | .metadata.name) = "sim"' /opt/sim/ngf.yaml \
    && sed -i 's|--gatewayclass=nginx|--gatewayclass=sim|' /opt/sim/ngf.yaml \
    && yq -i '(select(.kind == "NginxProxy") | .spec.kubernetes.service.type) = "ClusterIP"' /opt/sim/ngf.yaml \
    && yq -i 'del(select(.kind == "NginxProxy") | .spec.kubernetes.service.externalTrafficPolicy)' /opt/sim/ngf.yaml \
    && yq -r 'select(.kind == "GatewayClass") | .metadata.name' /opt/sim/ngf.yaml | grep -qx sim \
    && grep -q -- '--gatewayclass=sim' /opt/sim/ngf.yaml \
    && ! grep -q -- '--gatewayclass=nginx' /opt/sim/ngf.yaml \
    && yq -r 'select(.kind == "NginxProxy") | .spec.kubernetes.service.type' /opt/sim/ngf.yaml | grep -qx ClusterIP \
    && ! grep -q 'externalTrafficPolicy' /opt/sim/ngf.yaml

COPY kind-config.yaml bootstrap.sh phase.sh preload.txt /opt/sim/
COPY start.sh /start.sh
RUN sed -i 's/\r$//' /start.sh /opt/sim/bootstrap.sh /opt/sim/phase.sh /opt/sim/preload.txt \
 && chmod +x /start.sh /opt/sim/bootstrap.sh

# Downloads destined for the node images. Fetched here because the kind node
# image ships no curl; both derived node stages COPY out of /pkg.
#   - v1.35 kubeadm/kubelet/kubectl: q13's upgrade target, staged on the v1.34
#     aux node at /opt/packages
#   - etcdctl/etcdutl: q26's restore happens while the apiserver (and with it
#     `kubectl exec` into the etcd pod) is down, so the tools must live on the
#     node itself, on PATH
FROM sim AS fetch
ARG KUBE_UPGRADE_VERSION=v1.35.6
ARG ETCD_VERSION=v3.6.14
RUN ARCH=$(uname -m); case "$ARCH" in x86_64) ARCH=amd64 ;; aarch64) ARCH=arm64 ;; esac \
    && mkdir -p /pkg \
    && for b in kubeadm kubelet kubectl; do \
         curl -fsSL -o "/pkg/$b" "https://dl.k8s.io/release/${KUBE_UPGRADE_VERSION}/bin/linux/${ARCH}/$b"; \
       done \
    && curl -fsSL "https://github.com/etcd-io/etcd/releases/download/${ETCD_VERSION}/etcd-${ETCD_VERSION}-linux-${ARCH}.tar.gz" \
       | tar xz -C /tmp \
    && mv "/tmp/etcd-${ETCD_VERSION}-linux-${ARCH}/etcdctl" "/tmp/etcd-${ETCD_VERSION}-linux-${ARCH}/etcdutl" /pkg/ \
    && chmod +x /pkg/kubeadm /pkg/kubelet /pkg/kubectl /pkg/etcdctl /pkg/etcdutl

# The node image the clusters actually run: the pinned kind image plus root
# sshd (the candidate has root ssh to every node — see the CKA plan's freedom
# model) and the assets the aux questions need staged on the node. The stage
# ends by tarring its own rootfs; the preload stage ships that tar and start.sh
# / banks/_lib/aux-cluster.sh `docker import` it under the pristine tag inside the
# inner dockerd, reapplying the image config recorded in the .changes file.
# The virtual filesystems are excluded by name, not just by --one-file-system:
# tar still archives a foreign mount point's own directory entry, and sysfs's
# mtime churns mid-read ("./sys: file changed as we read it", exit 1). Leaving
# them out entirely is safe — docker/runc create missing mount destinations,
# which is how FROM-scratch images run. --one-file-system still covers the
# bind-mounted /etc/resolv.conf & friends (docker provides all of them at run
# time).
FROM ${NODE_IMAGE} AS node-ssh
COPY --from=fetch /pkg/etcdctl /pkg/etcdutl /usr/local/bin/
COPY --from=sim /opt/sim/calico.yaml /opt/packages/calico.yaml
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends openssh-server \
    && rm -rf /var/lib/apt/lists/* \
    && (systemctl disable ssh.socket 2>/dev/null || true) \
    && systemctl enable ssh \
    && printf 'PermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/10-sim.conf \
    && mkdir -p /root/.ssh && chmod 700 /root/.ssh
RUN tar --numeric-owner --xattrs --one-file-system \
      --exclude=./_rootfs.tar --exclude=./proc --exclude=./sys \
      --exclude=./dev --exclude=./run -C / -cf /_rootfs.tar .

# Same derivation from the older image: q13's aux cluster boots this at v1.34
# and the candidate upgrades it with the staged v1.35 binaries. kubeadm itself
# names the control-plane images the upgrade will need; that list is baked as
# archives below and banks/_lib/aux-cluster.sh loads them into the aux-upgrade cluster
# so the upgrade never needs the network.
FROM ${AUX_NODE_IMAGE} AS aux-node-ssh
ARG KUBE_UPGRADE_VERSION=v1.35.6
COPY --from=fetch /pkg/etcdctl /pkg/etcdutl /usr/local/bin/
COPY --from=fetch /pkg/kubeadm /pkg/kubelet /pkg/kubectl /opt/packages/
COPY --from=sim /opt/sim/calico.yaml /opt/packages/calico.yaml
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends openssh-server \
    && rm -rf /var/lib/apt/lists/* \
    && (systemctl disable ssh.socket 2>/dev/null || true) \
    && systemctl enable ssh \
    && printf 'PermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/10-sim.conf \
    && mkdir -p /root/.ssh && chmod 700 /root/.ssh \
    && chmod +x /opt/packages/kubeadm /opt/packages/kubelet /opt/packages/kubectl \
    && /opt/packages/kubeadm config images list --kubernetes-version "${KUBE_UPGRADE_VERSION}" \
       > /opt/packages/upgrade-images.txt \
    && grep -q "kube-apiserver:${KUBE_UPGRADE_VERSION}" /opt/packages/upgrade-images.txt
RUN tar --numeric-owner --xattrs --one-file-system \
      --exclude=./_rootfs.tar --exclude=./proc --exclude=./sys \
      --exclude=./dev --exclude=./run -C / -cf /_rootfs.tar .

FROM sim AS preload
ARG PRELOAD=full
RUN apk add --no-cache skopeo
COPY --from=node-ssh /_rootfs.tar /stage/_node.tar
COPY --from=aux-node-ssh /_rootfs.tar /stage/_aux_node.tar
COPY --from=aux-node-ssh /opt/packages/upgrade-images.txt /tmp/upgrade-images.txt
# A `repo:tag@digest` entry is pulled by digest and archived under `repo:tag`,
# because neither skopeo nor docker-archive accept tag and digest together —
# the same split the node tar has always done. Runtime loaders strip the
# digest the same way before looking the archive up.
RUN mkdir -p /out && \
    if [ "$PRELOAD" = "none" ]; then echo "prebaking disabled"; else \
      { yq -r '[.. | select(has("image")) | .image] | .[]' /opt/sim/calico.yaml; \
        yq -r '[.. | select(has("image")) | .image] | .[]' /opt/sim/ingress-nginx.yaml; \
        grep -v '^[[:space:]]*#' /opt/sim/preload.txt; \
        cat /opt/sim/gateway-images.txt; \
        cat /tmp/upgrade-images.txt; } \
      | sed '/^[[:space:]]*$/d' | sort -u > /tmp/all.txt && \
      while read -r img; do \
        ref="$img"; src="docker://$img"; \
        case "$img" in \
          *@sha256:*) ref="${img%%@*}"; src="docker://${ref%:*}@${img##*@}" ;; \
        esac; \
        out=/out/$(printf '%s' "$ref" | tr '/:@' '___').tar; \
        echo "baking $ref"; \
        skopeo copy --retry-times 3 "$src" "docker-archive:${out}:${ref}"; \
      done < /tmp/all.txt; \
    fi
# The node tars are rootfs exports, not docker archives, so `docker import`
# needs the original image config handed back to it. Record it per image as a
# .changes file (one --change line per row); a node image without an
# ENTRYPOINT row could never boot, so its absence fails the build here.
RUN if [ "$PRELOAD" = "full" ]; then \
      gen_changes() { \
        repo="${1%%@*}"; repo="${repo%:*}"; digest="${1##*@}"; \
        skopeo inspect --retry-times 3 --config "docker://${repo}@${digest}" \
        | jq -r '(if (.config.Entrypoint // [] | length) > 0 then "ENTRYPOINT \(.config.Entrypoint | tojson)" else empty end), \
                 (if (.config.Cmd // [] | length) > 0 then "CMD \(.config.Cmd | tojson)" else empty end), \
                 ((.config.Env // [])[] | capture("(?<k>[^=]*)=(?<v>.*)") | "ENV \(.k)=\(.v | tojson)"), \
                 (if (.config.WorkingDir // "") != "" then "WORKDIR \(.config.WorkingDir)" else empty end), \
                 (if (.config.User // "") != "" then "USER \(.config.User)" else empty end), \
                 (if (.config.StopSignal // "") != "" then "STOPSIGNAL \(.config.StopSignal)" else empty end), \
                 ((.config.Volumes // {}) | keys[] | "VOLUME \(.)")' \
        > "$2" && grep -q '^ENTRYPOINT ' "$2" \
        && printf 'LABEL sim.node-ssh=1\n' >> "$2"; \
      } && \
      mv /stage/_node.tar /out/_node.tar && \
      mv /stage/_aux_node.tar /out/_aux_node.tar && \
      gen_changes "${NODE_IMAGE}" /out/_node.tar.changes && \
      gen_changes "${AUX_NODE_IMAGE}" /out/_aux_node.tar.changes; \
    else rm -rf /stage; fi

FROM sim
COPY --from=preload /out /opt/sim/images
COPY --from=aux-node-ssh /opt/packages/upgrade-images.txt /opt/sim/upgrade-images.txt
ENTRYPOINT ["/start.sh"]
