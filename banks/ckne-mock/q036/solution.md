**ipBlock with cidr 203.0.113.0/24 and except 203.0.113.9/32** is correct: `ipBlock` accepts a `cidr` and an `except` list. Remember: with any egress policy, everything else gets blocked — including DNS; also allow port 53 to kube-dns.

Why the others are wrong:

- **Add the host to /etc/hosts as a blackhole** — pods do not read the nodes' hosts file, and a hosts entry cannot block an IP anyway — the policy is the only thing that filters packets.
- **ipBlock doesn't support exceptions** — `except` is exactly the exception list `ipBlock` provides for carving addresses out of a CIDR.
- **Two separate policies: one allow and one deny** — native NetworkPolicy has no deny action; a second policy could only allow more, never subtract the host from the first.
