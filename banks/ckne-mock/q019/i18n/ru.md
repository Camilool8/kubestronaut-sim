## Question

Как в Gateway API правильно разделены роли между Gateway и HTTPRoute?

## Options

- Оба выполняют одно и то же; HTTPRoute — только новое название
- Gateway определяет правила маршрутизации; HTTPRoute определяет listeners
- Gateway управляется оператором инфраструктуры и определяет listeners/addresses
- HTTPRoute заменяет Service, а Gateway заменяет Deployment

## Solution

**Gateway управляется оператором инфраструктуры и определяет listeners/addresses** — правильный ответ: Модель по ролям: `GatewayClass` — реализация, `Gateway` — инфраструктура: listeners, ports, TLS, а `HTTPRoute` — приложение: matches, filters, backends. Route ссылается на Gateway через `parentRefs`, а на Services через `backendRefs`.
