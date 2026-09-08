## Question

Qual recurso do Istio implementa autorização L7 (ex.: só o ServiceAccount "frontend" pode chamar GET /api no serviço "backend")?

## Options

- RBAC Role + RoleBinding
- PodSecurityPolicy
- NetworkPolicy nativa com um campo httpRules por método
- AuthorizationPolicy com from.source.principals e to.operation

## Solution

**AuthorizationPolicy com from.source.principals e to.operation** é a resposta correta: A `AuthorizationPolicy` avalia a identidade mTLS (principal SPIFFE), métodos, paths e headers — autorização L7 por workload. NetworkPolicy nativa é apenas L3/L4; RBAC controla a API, não o tráfego entre serviços.
