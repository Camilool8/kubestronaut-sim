## Question

Нужно опубликовать базу PostgreSQL TCP/5432 через Gateway с маршрутизацией L4. Какой ресурс Gateway API использовать?

## Options

- TCPRoute, подключённый к TCP listener Gateway
- UDPRoute
- HTTPRoute с path match /postgres
- GRPCRoute

## Solution

**TCPRoute, подключённый к TCP listener Gateway** — правильный ответ: `TCPRoute` маршрутизирует произвольные TCP-соединения от listener к backendRefs без HTTP-семантики. Также существуют `UDPRoute`, `TLSRoute` по SNI и `GRPCRoute`. Для баз данных, queues и proprietary protocols применяется TCPRoute.
