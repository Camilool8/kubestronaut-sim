**ndots:5 expansion via search domains (use a trailing-dot FQDN)** is correct: With `ndots:5`, any name with fewer than 5 dots is expanded through the search domains before the absolute query — producing 3–5 extra (NXDOMAIN) queries per resolution. A trailing dot forces an absolute query; `dnsConfig.options ndots:1` changes the behavior per pod.

Why the others are wrong:

- **CoreDNS is corrupted and answers late** — CoreDNS returning NXDOMAIN for `api.github.com.default.svc.cluster.local` is correct behaviour, and quick — the delay is in the number of round trips, not in each answer.
- **The record TTL is zero** — TTL affects caching of a completed answer; it cannot explain several failed lookups happening before the successful one.
- **Insufficient bandwidth between the nodes and CoreDNS** — DNS packets are tiny; a bandwidth shortage would slow everything, not add specific NXDOMAIN queries to the trace.
