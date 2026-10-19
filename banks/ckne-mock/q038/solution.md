**WireGuard or IPsec encryption in the CNI** is correct: Cilium and Calico offer transparent node-to-node encryption: WireGuard (automatic per-node keys) or IPsec (rotation via secret). It covers on-the-wire traffic between nodes — complementary to application mTLS.

Why the others are wrong:

- **kube-proxy in IPVS mode** — IPVS is a load-balancing backend; it forwards packets exactly as it receives them and encrypts nothing.
- **NetworkPolicy with an encrypt: true field** — NetworkPolicy has no `encrypt` field; it allows or denies traffic and never transforms it.
- **TLS in CoreDNS** — DNS-over-TLS would protect only name lookups to CoreDNS, not the pod-to-pod traffic that follows.
