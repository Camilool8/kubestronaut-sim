## Question

Las solicitudes de streaming (SSE) de un LLM detrás de un Gateway se interrumpen después de unos 30 segundos. ¿Cuál es la corrección adecuada?

## Options

- Aumentar los timeouts de request/idle en Gateway/HTTPRoute
- Deshabilitar TLS para reducir la latencia del handshake
- Reducir el keepalive del kernel
- Cambiar el Service a UDP, que no tiene timeouts

## Solution

**Aumentar los timeouts de request/idle en Gateway/HTTPRoute** es la respuesta correcta: Los proxies aplican timeouts predeterminados de 30 a 60 segundos. El streaming de tokens requiere aumentar `timeouts.request`/`backendRequest` en HTTPRoute (GEP-1742) o su equivalente, y mantener deshabilitado el buffering para SSE.
