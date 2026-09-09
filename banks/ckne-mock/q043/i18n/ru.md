## Question

Какой ресурс Istio реализует авторизацию L7, например чтобы только ServiceAccount «frontend» мог вызвать GET /api у сервиса «backend»?

## Options

- RBAC Role + RoleBinding
- PodSecurityPolicy
- Нативная NetworkPolicy с полем httpRules для каждого method
- AuthorizationPolicy с from.source.principals и to.operation

## Solution

**AuthorizationPolicy с from.source.principals и to.operation** — правильный ответ: `AuthorizationPolicy` проверяет mTLS identity — principal SPIFFE, методы, paths и headers — и выполняет L7-авторизацию для workload. Нативная NetworkPolicy работает только на L3/L4; RBAC управляет API, а не трафиком service-to-service.
