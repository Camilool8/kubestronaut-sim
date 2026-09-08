## Question

Что делает поле internalTrafficPolicy: Local у Service?

## Options

- Блокирует весь трафик извне кластера
- Заменяет CoreDNS
- Доставляет внутренний трафик только endpoints на узле клиента
- Включает внутренний mTLS

## Solution

**Доставляет внутренний трафик только endpoints на узле клиента** — правильный ответ: Это внутренний аналог externalTrafficPolicy. Он полезен для per-node daemons, например log agent или node-local cache, когда каждый pod должен обращаться к экземпляру на своём узле, уменьшая hops и задержку.
