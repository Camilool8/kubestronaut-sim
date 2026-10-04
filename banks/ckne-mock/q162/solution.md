**Normal ndots:5 behavior: external names get expanded through the search domains generating legitimate NXDOMAINs before the right answer** is correct: Before crying "attack", look at the SUFFIX of the failed queries: if they're external names + search domains, it's ndots. NXDOMAIN metrics need this context to avoid false alerts.

Why the others are wrong:

- **CoreDNS is out of memory** — memory pressure would slow or crash CoreDNS; it would not manufacture queries for `api.stripe.com.default.svc.cluster.local`.
- **CoreDNS was compromised** — the query names are ordinary external names plus the cluster search suffix — the resolver's own doing, not an intruder's.
- **A DNS tunneling attack** — DNS tunnelling uses long, high-entropy subdomains under an attacker's zone; these queries are legitimate names with the cluster's suffix appended.
