#!/usr/bin/env bash
set -euo pipefail
sed -i 's/^ENV RELEASE_CHANNEL=.*/ENV RELEASE_CHANNEL=stable/' /opt/course/9/image/Dockerfile
sudo podman build -t registry:5000/pulsar-agent:v1 /opt/course/9/image
sudo podman push --tls-verify=false registry:5000/pulsar-agent:v1
sudo podman rm -f pulsar-agent >/dev/null 2>&1 || true
sudo podman run -d --name pulsar-agent registry:5000/pulsar-agent:v1 >/dev/null
sleep 2
sudo podman logs pulsar-agent > /opt/course/9/pulsar.log
