**host-local allocates per node, uncoordinated, and can duplicate IPs** is correct: `host-local` keeps state only on the node's disk — two nodes can hand out the same IP on the secondary network. `whereabouts` records allocations in cluster CRDs, guaranteeing uniqueness of the whole range across all nodes.

Why the others are wrong:

- **Because host-local requires external DHCP** — host-local needs no DHCP — it hands out addresses from a static range and records leases in a local directory; that locality is precisely its weakness.
- **Because it is faster on every CNI ADD and DEL operation** — whereabouts is slower per operation, since every allocation is a coordinated write to a cluster resource; correctness across nodes is what you buy, not speed.
- **Because whereabouts only supports IPv6** — whereabouts handles IPv4 and IPv6 ranges alike; the address family is irrelevant to the duplicate-IP problem it solves.
