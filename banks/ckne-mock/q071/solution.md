**Caches responses for up to 30 s, cutting upstream load** is correct: The `cache` plugin stores responses (success and denial) for up to the given time, honoring lower TTLs. It's one of the highest-impact DNS performance knobs, along with adequate CoreDNS replicas.

Why the others are wrong:

- **Limits each pod to 30 queries** — the `cache` plugin has no per-client counters; rate limiting is not something a Corefile line does.
- **Raises every record's TTL to 30 minutes** — cache honours the record's own TTL when it is lower than the limit; it caps how long an answer may be kept, and never raises a TTL.
- **Creates 30 CoreDNS replicas** — replica count is set on the CoreDNS Deployment; the Corefile configures behaviour, not scale.
