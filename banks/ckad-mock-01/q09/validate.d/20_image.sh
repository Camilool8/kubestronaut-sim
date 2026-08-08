#!/usr/bin/env bash
# points: 3
# desc: image registry:5000/pulsar-agent:v1 was built, and carries the new value
set -uo pipefail
. /banks/_lib/checks.sh
podman image exists registry:5000/pulsar-agent:v1 2>/dev/null || {
  echo "registry:5000/pulsar-agent:v1 not found in root's podman storage — was it built with sudo?"
  show_actual text "$(podman images 2>/dev/null)"
  show_why "Rootless and rootful podman keep entirely separate image stores, and the grader runs as root. An image built without sudo lives in the candidate's own store and is invisible from here, which reads as 'not found' for an image you watched build. The list above is what root can see. The name also has to carry the registry prefix — that is what tells podman where a push should go."
  exit 1
}

value=$(podman image inspect registry:5000/pulsar-agent:v1 \
  --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
  | sed -n 's/^RELEASE_CHANNEL=//p' | tail -1)
[ "$value" = "stable" ] && echo "image built with RELEASE_CHANNEL=stable" || {
  echo "image has RELEASE_CHANNEL='$value' — rebuild after editing the Dockerfile"
  show_actual text "$(podman image inspect registry:5000/pulsar-agent:v1 --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null)"
  show_why "ENV is evaluated while the image is being built, so editing the Dockerfile changes nothing anywhere until the build runs again. The value above is the one baked into this image. Passing the variable at run time with -e would override it for one container without ever fixing the image, which is a useful thing to know and not what was asked for."
  exit 1
}
