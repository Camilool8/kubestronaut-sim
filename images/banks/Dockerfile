FROM alpine:3.21 AS index
RUN apk add --no-cache yq
COPY . /src
RUN find /src -type f -name '*.sh' -exec sed -i 's/\r$//' {} +
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
RUN find /src -type f -name '*.sh' -exec sed -i 's/\r$//' {} +
COPY --from=index /index /index
