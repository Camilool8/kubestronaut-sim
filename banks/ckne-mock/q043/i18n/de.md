## Question

Welche Istio-Ressource implementiert L7-Autorisierung (z. B. nur der ServiceAccount "frontend" darf GET /api am Service "backend" aufrufen)?

## Options

- RBAC Role + RoleBinding
- PodSecurityPolicy
- Native NetworkPolicy mit einem httpRules-Feld pro Methode
- AuthorizationPolicy mit from.source.principals und to.operation

## Solution

**AuthorizationPolicy mit from.source.principals und to.operation** ist die richtige Antwort: `AuthorizationPolicy` wertet die mTLS-Identität (SPIFFE-Principal), Methoden, Pfade und Header aus — L7-Autorisierung pro Workload. Native NetworkPolicy ist nur L3/L4; RBAC steuert die API, nicht Service-zu-Service-Traffic.
