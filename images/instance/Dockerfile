# Trixie, not bookworm, for podman: bookworm ships 4.3.1 (2022), trixie
# ships 5.x. The jump matters because 5.x replaced CNI with netavark,
# and CNI failing to rebuild its bridge after a restart was one of the
# reasons these containers ended up privileged. kind's own nodes already
# run trixie in this stack, so the distro is not new here.
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
COPY containers.conf /etc/containers/containers.conf

# chroot, not the default oci isolation, for the RUN steps of a build.
#
# `cgroups = "disabled"` in containers.conf covers `podman run`, but a
# build is buildah, and buildah still asks crun for a real container per
# RUN step. Under compose that works because `cgroup: host` hands the
# instance the host's cgroup namespace. Kubernetes has no pod-spec field
# for cgroup namespace mode and gives an unprivileged container a private
# one, where crun dies twice over — first
#
#   opening file `/sys/fs/cgroup/cgroup.subtree_control` for writing:
#   Read-only file system
#
# and then, once that mount is made writable, on the eBPF program it
# attaches for cgroup v2 device control:
#
#   bpf query: Operation not permitted
#
# Neither CAP_BPF and CAP_PERFMON nor a read-write bind of the host's
# /sys/fs/cgroup moves it; all four combinations were measured in a pod.
# The only two things that work are granting the container `privileged`
# — which would make a candidate's shell the most privileged container
# in the pod — or skipping the runtime for RUN steps, which is this.
#
# What it costs: a RUN step executes in a chroot rather than a container,
# so it gets no namespaces of its own. Nothing here needs them — the
# images the questions build are deliberately tiny, and the candidate is
# already root in this container. What it buys is one image that behaves
# the same under compose and under Kubernetes, with the capability set
# unchanged. Revisit if a question ever needs a RUN step that isolates.
#
# Set three ways because no single one reaches every caller, and the one
# that matters most is the one a candidate actually types:
#
#   ENV               only reaches processes the runtime execs directly
#                     (`compose exec`, `kubectl exec`). sshd sanitises the
#                     environment for login sessions, so it never reaches
#                     a candidate's shell.
#   /etc/environment  pam_env reads it for every login session, which is
#                     how `ssh instance-1` from the exam desktop gets it.
#   sudoers env_keep  sudo resets the environment, and q09 requires sudo
#                     ("rootless builds fail outright on these
#                     instances"), so without this the candidate's own
#                     `sudo podman build` is the one path still broken.
ENV BUILDAH_ISOLATION=chroot
RUN echo 'BUILDAH_ISOLATION=chroot' >> /etc/environment \
    && echo 'Defaults env_keep += "BUILDAH_ISOLATION"' > /etc/sudoers.d/buildah \
    && chmod 0440 /etc/sudoers.d/buildah

# Editor defaults. /etc/vim/vimrc.local is Debian's supported hook and is
# sourced after defaults.vim, so it survives a candidate creating their own
# ~/.vimrc — which would otherwise silently disable syntax highlighting,
# because defaults.vim is skipped entirely once one exists.
COPY vimrc.local /etc/vim/vimrc.local

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
