FROM debian:13-slim
ARG KUBECTL_VERSION=v1.35.0
ARG HELM_VERSION=v3.18.0
ARG YQ_VERSION=v4.45.1
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssh-server curl ca-certificates vim nano jq less bash-completion procps \
      sudo podman fuse-overlayfs uidmap nftables \
    && rm -rf /var/lib/apt/lists/*
RUN ARCH=$(dpkg --print-architecture) \
    && curl -fsSL -o /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${ARCH}/kubectl" \
    && curl -fsSL "https://get.helm.sh/helm-${HELM_VERSION}-linux-${ARCH}.tar.gz" | tar xz -C /tmp \
    && mv /tmp/linux-${ARCH}/helm /usr/local/bin/helm \
    && curl -fsSL -o /usr/local/bin/yq "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_${ARCH}" \
    && chmod +x /usr/local/bin/kubectl /usr/local/bin/helm /usr/local/bin/yq

COPY registries.conf /etc/containers/registries.conf
COPY storage.conf /etc/containers/storage.conf
COPY containers.conf /etc/containers/containers.conf

ENV BUILDAH_ISOLATION=chroot
RUN echo 'BUILDAH_ISOLATION=chroot' >> /etc/environment \
    && echo 'Defaults env_keep += "BUILDAH_ISOLATION"' > /etc/sudoers.d/buildah \
    && chmod 0440 /etc/sudoers.d/buildah

COPY vimrc.local /etc/vim/vimrc.local

RUN useradd -m -s /bin/bash candidate && echo 'candidate:candidate' | chpasswd \
    && echo 'candidate ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/candidate \
    && chmod 0440 /etc/sudoers.d/candidate \
    && mkdir -p /opt/course /run/sshd /var/lib/containers && chown candidate:candidate /opt/course \
    && printf 'alias k=kubectl\nsource <(kubectl completion bash)\ncomplete -o default -F __start_kubectl k\n' >> /home/candidate/.bashrc
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 22
ENTRYPOINT ["/entrypoint.sh"]
