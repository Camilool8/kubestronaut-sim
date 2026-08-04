FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 go build -o /conductor ./cmd/conductor

FROM alpine:3.21
# yq: the entrypoint pre-converts bank exam.yaml files to JSON, same
# approach as the other bank-reading services (the Go binaries never
# parse YAML).
#
# openssh-client: only ENGINE=ssh uses it, for the hosted deployment
# where the whole stack is one Pod and there is no Docker socket to
# reach the other containers through. internal/sshexec shells out to
# this binary rather than speaking the protocol, the same way
# facilitator/internal/evaluate reaches the instances to grade. Idle
# under compose, which keeps ENGINE=docker.
#
# Still no docker CLI, deliberately: the Engine API client is
# hand-written precisely so this image does not need one.
RUN apk add --no-cache yq openssh-client
COPY --from=build /conductor /conductor
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
