FROM docker:27-dind
ARG KIND_VERSION=v0.32.0
ARG KUBECTL_VERSION=v1.35.6
ARG NODE_IMAGE=kindest/node:v1.35.5@sha256:ce977ae6d65918d0b58a5f8b5e940429c2ce42fa3a5619ec2bbc60b949c0ac95
ENV NODE_IMAGE=${NODE_IMAGE}
RUN apk add --no-cache bash curl jq yq openssh-client openssl
RUN ARCH=$(uname -m); case "$ARCH" in x86_64) ARCH=amd64 ;; aarch64) ARCH=arm64 ;; esac \
    && curl -fsSL -o /usr/local/bin/kind "https://kind.sigs.k8s.io/dl/${KIND_VERSION}/kind-linux-${ARCH}" \
    && curl -fsSL -o /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${ARCH}/kubectl" \
    && chmod +x /usr/local/bin/kind /usr/local/bin/kubectl
COPY kind-config.yaml bootstrap.sh grade.sh /opt/sim/
COPY start.sh /start.sh
RUN chmod +x /start.sh /opt/sim/bootstrap.sh /opt/sim/grade.sh
ENTRYPOINT ["/start.sh"]
