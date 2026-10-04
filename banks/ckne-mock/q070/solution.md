**Running a DNS cache on each node** is correct: NodeLocal DNSCache (a DaemonSet) intercepts queries on the node itself at a link-local IP (e.g., 169.254.20.10), answering from cache and upgrading to TCP toward CoreDNS — mitigating the classic conntrack races with DNS/UDP.

Why the others are wrong:

- **Blocking external queries** — it is a cache and forwarder, not a filter; blocking is a Corefile policy or a NetworkPolicy job.
- **Replacing CoreDNS** — CoreDNS remains the authoritative cluster resolver; the node cache forwards misses to it over TCP.
- **Serving only PTR records** — it serves whatever the pod asks — A, AAAA, SRV, PTR — from cache or upstream; nothing about it is PTR-specific.
