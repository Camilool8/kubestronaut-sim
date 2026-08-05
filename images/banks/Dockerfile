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

# The index: every bank's exam.yaml as JSON, plus catalog.yaml.
#
# It exists for the hub, which is the one process that needs to know what
# exams exist BEFORE any session Pod has been created — a candidate in
# the lobby is choosing which certification to sit, and there is nothing
# running yet to ask. Every other consumer reads the YAML in /src.
#
# Converted here, at build time, rather than by a yq init container in
# the hub's Deployment. The hub is a FROM scratch image with no shell,
# and this repo's rule is that no Go binary parses YAML — so the JSON has
# to be produced by something, and the image that owns the content is the
# honest place for it. It is generated, never authored: /src stays the
# single source of truth and this cannot drift from it.
#
# Same layout the conductor's entrypoint produces at runtime
# (<id>.json plus _catalog.json), so the two scans read the same shape.
FROM alpine:3.21 AS index
RUN apk add --no-cache yq
COPY . /src
RUN set -eu; \
    mkdir -p /index; \
    for f in /src/*/exam.yaml; do \
      [ -f "$f" ] || continue; \
      id=$(basename "$(dirname "$f")"); \
      yq -o=json '.' "$f" > "/index/${id}.json"; \
    done; \
    if [ -f /src/catalog.yaml ]; then \
      yq -o=json '.' /src/catalog.yaml > /index/_catalog.json; \
    fi

FROM alpine:3.21
COPY . /src
COPY --from=index /index /index
