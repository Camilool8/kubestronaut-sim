## Question

Sie müssen eine PostgreSQL-Datenbank (TCP/5432) über ein Gateway mit L4-Routing exponieren. Welche Gateway-API-Ressource?

## Options

- TCPRoute an einem TCP-Listener des Gateways
- UDPRoute
- HTTPRoute mit einem Path-Match /postgres
- GRPCRoute

## Solution

**TCPRoute an einem TCP-Listener des Gateways** ist die richtige Antwort: `TCPRoute` routet beliebige TCP-Verbindungen von einem Listener zu backendRefs — ohne HTTP-Semantik. Es gibt auch `UDPRoute`, `TLSRoute` (SNI) und `GRPCRoute`. Datenbanken, Queues und proprietäre Protokolle nutzen TCPRoute.
