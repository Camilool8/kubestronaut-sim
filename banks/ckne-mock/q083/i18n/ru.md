## Question

Какова роль GatewayClass в Gateway API?

## Options

- Определять implementation/controller, который материализует Gateways
- Группировать HTTPRoutes по версии
- Определять TLS-сертификаты
- Обязательно заменять IngressClass во всём кластере

## Solution

**Определять implementation/controller, который материализует Gateways** — правильный ответ: `GatewayClass`, ресурс уровня кластера, указывает, КТО реализует Gateway: `controllerName` ссылается на controller, например istio.io/gateway-controller или gateway.envoyproxy.io/.... В кластере может быть несколько classes — internal, external, mesh — и каждый Gateway ссылается на одну.
