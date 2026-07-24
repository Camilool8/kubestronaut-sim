FROM node:22-alpine AS ui-build
WORKDIR /src/ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci
COPY ui/ ./
RUN npm run build

FROM golang:1.24-alpine AS build
WORKDIR /src
COPY facilitator/go.mod ./
COPY facilitator/cmd ./cmd
COPY facilitator/internal ./internal
COPY --from=ui-build /src/ui/dist/. ./internal/web/dist/
RUN CGO_ENABLED=0 go build -o /facilitator ./cmd/facilitator

FROM alpine:3.21
RUN apk add --no-cache yq-go openssh-client
COPY --from=build /facilitator /facilitator
COPY facilitator/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
