## Question

Какой ресурс и режим Istio заставляют ВСЕ соединения, принимаемые workloads namespace, использовать mTLS и отклоняют plaintext?

## Options

- NetworkPolicy с полем tls
- Gateway с allowInsecure: false
- PeerAuthentication с mtls.mode: STRICT
- DestinationRule с tls: DISABLE

## Solution

**PeerAuthentication с mtls.mode: STRICT** — правильный ответ: `PeerAuthentication STRICT` на namespace или весь mesh заставляет sidecars/ztunnel принимать только mTLS. Режим PERMISSIVE, используемый по умолчанию, принимает оба варианта и полезен при migration, но в production его следует закрывать.
