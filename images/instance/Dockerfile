FROM debian:12-slim
ARG KUBECTL_VERSION=v1.35.0
ARG HELM_VERSION=v3.18.0
ARG YQ_VERSION=v4.45.1
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssh-server curl ca-certificates vim nano jq less bash-completion procps \
    && rm -rf /var/lib/apt/lists/*
RUN ARCH=$(dpkg --print-architecture) \
    && curl -fsSL -o /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${ARCH}/kubectl" \
    && curl -fsSL "https://get.helm.sh/helm-${HELM_VERSION}-linux-${ARCH}.tar.gz" | tar xz -C /tmp \
    && mv /tmp/linux-${ARCH}/helm /usr/local/bin/helm \
    && curl -fsSL -o /usr/local/bin/yq "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_${ARCH}" \
    && chmod +x /usr/local/bin/kubectl /usr/local/bin/helm /usr/local/bin/yq
RUN useradd -m -s /bin/bash candidate && echo 'candidate:candidate' | chpasswd \
    && mkdir -p /opt/course /run/sshd && chown candidate:candidate /opt/course \
    && printf 'alias k=kubectl\nsource <(kubectl completion bash)\ncomplete -o default -F __start_kubectl k\n' >> /home/candidate/.bashrc
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 22
ENTRYPOINT ["/entrypoint.sh"]
