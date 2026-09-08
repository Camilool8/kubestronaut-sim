## Question

Você precisa expor um banco PostgreSQL (TCP/5432) através de um Gateway, com roteamento L4. Qual recurso do Gateway API usar?

## Options

- TCPRoute anexado a um listener TCP do Gateway
- UDPRoute
- HTTPRoute com match de path /postgres
- GRPCRoute

## Solution

**TCPRoute anexado a um listener TCP do Gateway** é a resposta correta: `TCPRoute` roteia conexões TCP arbitrárias de um listener para backendRefs — sem semântica HTTP. Há também `UDPRoute`, `TLSRoute` (SNI) e `GRPCRoute`. Bancos, filas e protocolos proprietários usam TCPRoute.
