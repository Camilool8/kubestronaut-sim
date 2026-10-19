**Allow egress to the kube-dns pods** is correct: With deny-all egress, even queries to CoreDNS are blocked — classic symptom: `could not resolve host` for everything. Allow UDP and TCP 53 (TCP is used for large/truncated responses).

Why the others are wrong:

- **Allow ingress on port 443** — the problem is outbound queries from the isolated pods, so an ingress rule on an unrelated port changes nothing.
- **Recreate the kube-dns Service** — the Service was never broken; the policy drops the packets before they reach the VIP, regardless of what the Service looks like.
- **Move CoreDNS to hostNetwork** — moving CoreDNS changes where it listens, not whether the isolated pods may send packets to it; egress from those pods stays denied.
