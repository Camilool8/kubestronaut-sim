**AuthorizationPolicy with from.source.principals and to.operation** is correct: `AuthorizationPolicy` evaluates the mTLS identity (SPIFFE principal), methods, paths and headers — per-workload L7 authorization. Native NetworkPolicy is L3/L4 only; RBAC controls the API, not service-to-service traffic.

Why the others are wrong:

- **RBAC Role + RoleBinding** — Kubernetes RBAC governs API server requests (who may create a Deployment); it never sees HTTP traffic between workloads.
- **PodSecurityPolicy** — PodSecurityPolicy constrained pod specs (privileges, volumes) and was removed in 1.25; it had nothing to do with request authorization.
- **Native NetworkPolicy with an httpRules field per method** — native NetworkPolicy has no HTTP fields at all; it operates on IPs, selectors and L4 ports.
