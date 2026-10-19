**Distributed tracing propagating the traceparent header** is correct: Distributed tracing correlates spans from each hop; without propagating the `traceparent` header (W3C Trace Context), spans become orphans. It's the right tool to find where latency happens.

Why the others are wrong:

- **Ping with NTP-synchronized timestamps** — ping measures reachability and round-trip time to one host; it cannot follow a request through three services.
- **SNMP polling on the switches** — SNMP polls interface counters on network devices; it has no notion of a request or of application hops.
- **kubectl logs -f on all pods** — log lines from several pods have nothing to correlate them unless a trace or request ID is propagated — which is exactly what tracing adds.
