**A conntrack race condition with parallel UDP queries** is correct: The "cursed 5 seconds": drops from an insertion race in conntrack with UDP. NodeLocal DNSCache removes NAT from the path (and goes upstream via TCP) — the most recommended structural fix.

Why the others are wrong:

- **A bad network cable on one of the nodes** — a faulty link produces random loss and retransmissions, not a failure that lands on exactly the resolver's 5-second retry timeout.
- **CoreDNS is slow under any load** — CoreDNS is not inherently slow; a slow resolver would show variable latency, not a precise 5-second cliff.
- **Zero TTL on the records returned by upstream** — a zero TTL causes more queries, each of which still completes normally; it does not drop them.
