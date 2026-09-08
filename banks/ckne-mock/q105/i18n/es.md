## Question

Debe permitir egress únicamente hacia api.github.com, cuyas IP cambian constantemente. ¿Qué solución lo gestiona de forma nativa en Cilium?

## Options

- hostAliases en el pod
- NetworkPolicy nativa con un campo dns
- CiliumNetworkPolicy con toFQDNs
- ipBlock con todos los rangos de GitHub actualizados manualmente

## Solution

**CiliumNetworkPolicy con toFQDNs** es la respuesta correcta: NetworkPolicy nativa solo acepta IP/selectors. Cilium intercepta DNS mediante su dns proxy, aprende las IP resueltas para el FQDN permitido y las autoriza dinámicamente: la policy sigue al nombre, no a la IP. También debe permitir egress DNS mediante reglas toPorts para el puerto 53.
