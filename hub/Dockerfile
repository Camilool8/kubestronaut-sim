FROM node:26-alpine AS ui-build
WORKDIR /src/ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci
COPY ui/ ./
RUN npm run build

FROM golang:1.27-alpine AS build
WORKDIR /src
COPY hub/go.mod ./
COPY hub/cmd ./cmd
COPY hub/internal ./internal
COPY --from=ui-build /src/ui/dist/. ./internal/web/dist/
RUN CGO_ENABLED=0 go build -o /hub ./cmd/hub
RUN mkdir -p /state && chown 65532:65532 /state

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /hub /hub
COPY --from=build --chown=65532:65532 /state /state
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/hub"]
