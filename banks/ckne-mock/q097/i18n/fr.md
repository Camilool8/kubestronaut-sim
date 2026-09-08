## Question

Vous devez exposer une base PostgreSQL (TCP/5432) à travers un Gateway, avec routage L4. Quelle ressource de la Gateway API ?

## Options

- TCPRoute attachée à un listener TCP du Gateway
- UDPRoute
- HTTPRoute avec un match de path /postgres
- GRPCRoute

## Solution

**TCPRoute attachée à un listener TCP du Gateway** est la bonne réponse : `TCPRoute` route des connexions TCP arbitraires d'un listener vers des backendRefs — sans sémantique HTTP. Il existe aussi `UDPRoute`, `TLSRoute` (SNI) et `GRPCRoute`. Bases, files et protocoles propriétaires : TCPRoute.
