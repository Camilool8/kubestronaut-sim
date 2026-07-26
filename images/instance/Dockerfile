FROM debian:12-slim
ARG KUBECTL_VERSION=v1.35.0
ARG HELM_VERSION=v3.18.0
ARG YQ_VERSION=v4.45.1
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssh-server curl ca-certificates vim nano jq less bash-completion procps \
      sudo podman fuse-overlayfs uidmap \
    && rm -rf /var/lib/apt/lists/*
RUN ARCH=$(dpkg --print-architecture) \
    && curl -fsSL -o /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${ARCH}/kubectl" \
    && curl -fsSL "https://get.helm.sh/helm-${HELM_VERSION}-linux-${ARCH}.tar.gz" | tar xz -C /tmp \
    && mv /tmp/linux-${ARCH}/helm /usr/local/bin/helm \
    && curl -fsSL -o /usr/local/bin/yq "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_${ARCH}" \
    && chmod +x /usr/local/bin/kubectl /usr/local/bin/helm /usr/local/bin/yq

# The registry the image questions push to is plain HTTP on the exam
# network. Nothing here is reachable from outside the compose project, and
# issuing certificates for a throwaway registry would only teach a
# workaround the real exam does not ask for.
COPY registries.conf /etc/containers/registries.conf
# vfs, not overlay: these instances are themselves containers, and
# overlayfs on overlayfs fails without extra plumbing. vfs copies whole
# layers instead of stacking them, so it is slow and space-hungry —
# acceptable because the only images built here are deliberately tiny, and
# bulletproof, which matters more than fast when a candidate is timed.
COPY storage.conf /etc/containers/storage.conf

# Candidates get sudo. Image work has to run as root (podman's rootful
# path is the one that works with the capability set these containers
# carry), and the real exam's instances are sudo-capable too.
RUN useradd -m -s /bin/bash candidate && echo 'candidate:candidate' | chpasswd \
    && echo 'candidate ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/candidate \
    && chmod 0440 /etc/sudoers.d/candidate \
    && mkdir -p /opt/course /run/sshd /var/lib/containers && chown candidate:candidate /opt/course \
    && printf 'alias k=kubectl\nsource <(kubectl completion bash)\ncomplete -o default -F __start_kubectl k\n' >> /home/candidate/.bashrc
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 22
ENTRYPOINT ["/entrypoint.sh"]
