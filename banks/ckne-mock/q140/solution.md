**The node's resolv.conf points to 127.0.0.53** is correct: The `loop` plugin exists exactly to catch this cycle: forward → local stub → CoreDNS again. The kubelet's `--resolv-conf` flag (or equivalent config) solves it.

Why the others are wrong:

- **Missing RBAC for the CoreDNS ServiceAccount** — missing RBAC produces API permission errors in the log, not a forwarding loop.
- **A corrupted image in the internal registry** — a corrupted image fails to pull or to start; it does not run far enough to detect a loop.
- **Too many replicas** — replica count does not create query loops; every replica would loop for the same reason.
