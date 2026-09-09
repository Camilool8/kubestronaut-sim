## Question

Какой ресурс Istio регистрирует ВНЕШНИЙ сервис, например api.stripe.com, в service registry mesh, позволяя применять routes, TLS и policies к egress-трафику?

## Options

- ServiceEntry
- EgressClass
- OutboundPolicy
- ExternalName

## Solution

**ServiceEntry** — правильный ответ: `ServiceEntry` добавляет внешние hosts в registry Istio. Вместе с VirtualService/DestinationRule и egress gateway он позволяет контролировать, наблюдать и шифровать трафик, покидающий mesh, включая блокировку необъявленных destinations в режиме REGISTRY_ONLY.
