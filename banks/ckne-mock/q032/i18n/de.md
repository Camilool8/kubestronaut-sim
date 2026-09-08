## Question

Streaming-(SSE-)Requests eines LLM hinter einem Gateway brechen nach ~30 s ab. Was ist der richtige Fix?

## Options

- Die Request-/Idle-Timeouts am Gateway/HTTPRoute erhöhen
- TLS deaktivieren, um die Handshake-Latenz zu senken
- Den Kernel-Keepalive senken
- Den Service auf UDP umstellen, das keine Timeouts kennt

## Solution

**Die Request-/Idle-Timeouts am Gateway/HTTPRoute erhöhen** ist die richtige Antwort: Proxies setzen Standard-Timeouts (30–60 s). Token-Streaming erfordert höhere `timeouts.request`/`backendRequest` an der HTTPRoute (GEP-1742) o. Ä., und Buffering für SSE deaktiviert zu lassen.
