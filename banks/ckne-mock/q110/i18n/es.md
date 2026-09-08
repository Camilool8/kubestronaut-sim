## Question

En Istio, ¿qué recurso y modo obligan a que TODO el tráfico recibido por los workloads de un namespace utilice mTLS, rechazando conexiones en texto claro?

## Options

- NetworkPolicy con un campo tls
- Gateway con allowInsecure: false
- PeerAuthentication con mtls.mode: STRICT
- DestinationRule con tls: DISABLE

## Solution

**PeerAuthentication con mtls.mode: STRICT** es la respuesta correcta: `PeerAuthentication STRICT` (por namespace o para todo el mesh) hace que sidecars/ztunnel acepten únicamente mTLS. El modo PERMISSIVE (predeterminado) acepta ambos, útil durante una migración pero debe cerrarse en producción.
