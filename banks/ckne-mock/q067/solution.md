**A restrictive L4 NetworkPolicy, or an MTU/PMTUD problem** is correct: Small ICMP crosses paths that drop large packets (MTU) and may be treated differently by policies. Test with `nc -zv`, compare small vs. large payloads (does `curl` of bigger files hang?) and review L4 policies.

Why the others are wrong:

- **ICMP is disabled in both nodes' kernels** — ICMP is the one thing that works here; disabling it would make ping fail, not TCP.
- **DNS is down in the pod's namespace** — the test uses IPs directly, so no name is resolved — DNS cannot be what breaks a TCP connect to an address.
- **The pod needs root privileges** — opening a client connection to port 8080 needs no privilege; only binding ports below 1024 does, and that is on the server side.
