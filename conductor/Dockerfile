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
RUN apk add --no-cache yq
COPY --from=build /conductor /conductor
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
