FROM docker:27-dind AS sim
ARG KIND_VERSION=v0.32.0
ARG KUBECTL_VERSION=v1.35.6
ARG HELM_VERSION=v3.21.3
ARG CALICO_VERSION=v3.32.1
ARG INGRESS_NGINX_VERSION=controller-v1.15.1
ARG NODE_IMAGE=kindest/node:v1.35.5@sha256:ce977ae6d65918d0b58a5f8b5e940429c2ce42fa3a5619ec2bbc60b949c0ac95
ENV NODE_IMAGE=${NODE_IMAGE}
RUN mkdir -p /opt/sim && printf '%s' "${NODE_IMAGE}" > /opt/sim/node-image
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

COPY kind-config.yaml bootstrap.sh phase.sh preload.txt /opt/sim/
COPY start.sh /start.sh
RUN sed -i 's/\r$//' /start.sh /opt/sim/bootstrap.sh /opt/sim/phase.sh /opt/sim/preload.txt \
 && chmod +x /start.sh /opt/sim/bootstrap.sh

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
RUN if [ "$PRELOAD" = "full" ]; then \
      ref="${NODE_IMAGE%%@*}"; \
      repo="${ref%:*}"; \
      digest="${NODE_IMAGE##*@}"; \
      skopeo copy --retry-times 3 "docker://${repo}@${digest}" "docker-archive:/out/_node.tar:${ref}"; \
    fi

FROM sim
COPY --from=preload /out /opt/sim/images
ENTRYPOINT ["/start.sh"]
