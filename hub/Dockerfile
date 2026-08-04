FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 go build -o /hub ./cmd/hub
# STATE_DIR's default, created here because a scratch image has no shell
# to create it with and the hub runs as 65532. Without it the process
# dies at start with "mkdir /state: permission denied" — a Pod with a
# real volume mounted there never sees this, which is exactly why it
# would be found by whoever first ran the image on its own.
RUN mkdir -p /state && chown 65532:65532 /state

# scratch, not alpine, and it is the only image in this repo that can be.
# The hub speaks HTTP to two places — the Kubernetes API and each session
# Pod — and shells out to nothing, so it needs no yq, no ssh, no busybox.
# It is also the only process here that is reachable from the internet,
# which makes "there is no shell in this image" worth having.
FROM scratch
# The Kubernetes API server is TLS and the hub verifies it against the
# ServiceAccount's own CA bundle, which the kubelet projects into the
# Pod. This is here for the OTHER TLS client in the process: the GitHub
# OAuth exchange, which needs public roots.
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /hub /hub
COPY --from=build --chown=65532:65532 /state /state
# Non-root by default. Nothing here writes outside /state, which is a
# volume the chart owns.
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/hub"]
