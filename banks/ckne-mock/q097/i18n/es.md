## Question

Necesita exponer una base de datos PostgreSQL (TCP/5432) mediante un Gateway, con enrutamiento L4. ¿Qué recurso de Gateway API utiliza?

## Options

- TCPRoute conectado a un listener TCP del Gateway
- UDPRoute
- HTTPRoute con un match de path /postgres
- GRPCRoute

## Solution

**TCPRoute conectado a un listener TCP del Gateway** es la respuesta correcta: `TCPRoute` enruta conexiones TCP arbitrarias desde un listener hacia backendRefs, sin semántica HTTP. También existen `UDPRoute`, `TLSRoute` (SNI) y `GRPCRoute`. Bases de datos, colas y protocolos propietarios utilizan TCPRoute.
