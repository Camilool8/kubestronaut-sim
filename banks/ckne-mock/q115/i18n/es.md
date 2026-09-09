## Question

¿Qué recurso de Gateway API enruta conexiones TLS por SNI SIN descifrarlas y a qué modo de listener se asocia?

## Options

- TCPRoute con el campo tls: true habilitado
- HTTPRoute en modo Secure
- CertRoute con SNI automático
- TLSRoute, en un listener TLS en modo Passthrough

## Solution

**TLSRoute, en un listener TLS en modo Passthrough** es la respuesta correcta: `TLSRoute` hace match con el SNI del ClientHello y reenvía el stream cifrado intacto al backend, que termina TLS. Es el mecanismo para exponer varios servicios TLS end-to-end detrás de una sola IP.
