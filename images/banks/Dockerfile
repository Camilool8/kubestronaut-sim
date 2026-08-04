# The question banks, as an image.
#
# Under compose, ./banks is bind-mounted read-only into k8s-env, both
# instances, docs-proxy, the conductor and the facilitator. A Pod has no
# host to bind from, and those six containers are built from three
# different Docker contexts, so baking banks into each of them would mean
# three copies drifting apart and a facilitator rebuild every time a
# question changes.
#
# Instead they ship once, here, and an init container stages them into a
# shared volume the rest of the Pod mounts read-only. Content, versioned
# and released like content.
#
# The build context is banks/, not the repository root: the root
# .dockerignore excludes banks/ so it stays out of the facilitator's
# context, and that exclusion would apply here too.
#
#   docker build -f images/banks/Dockerfile -t <repo>/kubestronaut-sim-banks banks/
FROM alpine:3.21
COPY . /src
