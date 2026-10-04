**Increase the request/idle timeouts on the Gateway/HTTPRoute** is correct: Proxies apply default timeouts (30–60s). Token streaming requires raising `timeouts.request`/`backendRequest` on the HTTPRoute (GEP-1742) or equivalent, and keeping buffering disabled for SSE.

Why the others are wrong:

- **Disable TLS to reduce handshake latency** — TLS adds milliseconds at connection setup; a stream cut at a round 30 seconds is a proxy timeout, not handshake latency.
- **Lower the kernel keepalive** — TCP keepalive concerns idle sockets at the kernel level; the proxy's application-level timeout fires regardless, and lowering keepalive shortens nothing that matters here.
- **Switch the Service to UDP, which has no timeouts** — SSE is HTTP over TCP; UDP has no streams to keep open, and gateways would not route it as HTTP at all.
