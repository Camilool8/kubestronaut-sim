## Question

Помимо mTLS identity workload как проверять JWT-токены КОНЕЧНОГО ПОЛЬЗОВАТЕЛЯ в запросах к сервису Istio?

## Options

- RequestAuthentication + AuthorizationPolicy, требующая requestPrincipals
- Нативная NetworkPolicy со специальным полем jwt
- Basic Auth в ConfigMap
- Проверять только во frontend до gateway

## Solution

**RequestAuthentication + AuthorizationPolicy, требующая requestPrincipals** — правильный ответ: `RequestAuthentication` определяет проверку token — issuer и JWKS keys — но сам отклоняет только НЕВАЛИДНЫЕ tokens. `AuthorizationPolicy` с `requestPrincipals: ["*"]` требует присутствия валидного token. Уровни workload и user дополняют друг друга.
