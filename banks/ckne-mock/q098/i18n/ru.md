## Question

Перед продвижением новой версии нужно отправлять ей КОПИЮ реального production-трафика, не позволяя её ответам влиять на клиентов. Какой filter HTTPRoute это делает?

## Options

- requestMirror (shadow traffic)
- urlRewrite
- retryPolicy
- backendRefs с weight 50/50

## Solution

**requestMirror (shadow traffic)** — правильный ответ: `RequestMirror` реализует shadowing: production продолжает обслуживаться основным backend, а новая версия получает идентичный трафик для проверки errors/latency без риска для пользователей, в отличие от canary, ответы которого реально возвращаются клиентам.
