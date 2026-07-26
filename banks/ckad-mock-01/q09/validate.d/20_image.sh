#!/usr/bin/env bash
# points: 2
# desc: image registry:5000/pulsar-agent:v1 was built, and carries the new value
set -uo pipefail
# Checks run as root, so this is root's podman storage — the one `sudo
# podman build` writes to. A rootless build lands in the candidate's own
# store and would be invisible here, which is why the question insists
# on sudo and why this message says so.
podman image exists registry:5000/pulsar-agent:v1 2>/dev/null \
  || { echo "registry:5000/pulsar-agent:v1 not found in root's podman storage — was it built with sudo?"; exit 1; }

value=$(podman image inspect registry:5000/pulsar-agent:v1 \
  --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
  | sed -n 's/^RELEASE_CHANNEL=//p' | tail -1)
[ "$value" = "stable" ] \
  && echo "image built with RELEASE_CHANNEL=stable" \
  || { echo "image has RELEASE_CHANNEL='$value' — rebuild after editing the Dockerfile"; exit 1; }
