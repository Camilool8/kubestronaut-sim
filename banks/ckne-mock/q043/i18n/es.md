## Question

¿Qué recurso de Istio implementa autorización L7 (por ejemplo, que solo el ServiceAccount "frontend" pueda llamar GET /api en el servicio "backend")?

## Options

- RBAC Role + RoleBinding
- PodSecurityPolicy
- NetworkPolicy nativa con un campo httpRules por método
- AuthorizationPolicy con from.source.principals y to.operation

## Solution

**AuthorizationPolicy con from.source.principals y to.operation** es la respuesta correcta: `AuthorizationPolicy` evalúa la identidad mTLS (principal SPIFFE), métodos, paths y headers: autorización L7 por workload. NetworkPolicy nativa solo opera en L3/L4; RBAC controla la API, no el tráfico entre servicios.
