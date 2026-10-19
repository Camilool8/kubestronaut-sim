**nftables** is correct: The `nftables` mode (GA in Kubernetes 1.33) uses the successor API to iptables, with more efficient rule updates and better performance in clusters with many Services. eBPF (Cilium) remains the alternative outside kube-proxy.

Why the others are wrong:

- **socketd** — not a kube-proxy backend at all; there is no such mode.
- **ebtables** — ebtables filters Ethernet frames on Linux bridges; it works below IP and cannot implement Service DNAT.
- **tc** — tc shapes and classifies traffic on interfaces (and hosts eBPF programs); kube-proxy never used it as a Service backend.
