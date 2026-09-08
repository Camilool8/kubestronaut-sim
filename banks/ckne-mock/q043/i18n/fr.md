## Question

Quelle ressource Istio implémente l'autorisation L7 (ex. seul le ServiceAccount « frontend » peut appeler GET /api sur « backend ») ?

## Options

- RBAC Role + RoleBinding
- PodSecurityPolicy
- NetworkPolicy native avec un champ httpRules par méthode
- AuthorizationPolicy avec from.source.principals et to.operation

## Solution

**AuthorizationPolicy avec from.source.principals et to.operation** est la bonne réponse : `AuthorizationPolicy` évalue l'identité mTLS (principal SPIFFE), méthodes, chemins et headers — autorisation L7 par workload. La NetworkPolicy native est L3/L4 ; RBAC contrôle l'API, pas le trafic service-à-service.
