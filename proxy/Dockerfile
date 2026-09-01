FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 go build -o /docs-proxy ./cmd/docs-proxy

FROM alpine:3.24
RUN apk add --no-cache yq-go
COPY --from=build /docs-proxy /docs-proxy
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh
EXPOSE 3128
ENTRYPOINT ["/entrypoint.sh"]
