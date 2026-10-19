**TCPRoute attached to a TCP listener on the Gateway** is correct: `TCPRoute` routes arbitrary TCP connections from a listener to backendRefs — no HTTP semantics. There are also `UDPRoute`, `TLSRoute` (SNI) and `GRPCRoute`. Databases, queues and proprietary protocols use TCPRoute.

Why the others are wrong:

- **UDPRoute** — PostgreSQL speaks TCP; a UDP listener would never see its connections.
- **HTTPRoute with a /postgres path match** — the PostgreSQL wire protocol is not HTTP; an HTTP listener cannot parse it, and there is no path to match.
- **GRPCRoute** — gRPC is HTTP/2-based; PostgreSQL does not speak it.
