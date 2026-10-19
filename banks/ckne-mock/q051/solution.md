**Compare node_nf_conntrack_entries with node_nf_conntrack_entries_limit** is correct: Every NATed connection occupies a conntrack entry. Full table = silent drops and intermittent failures. Monitor the entries/limit ratio in node_exporter and tune `nf_conntrack_max`.

Why the others are wrong:

- **Restarting the CNI fixes it for good** — restarting the CNI flushes state temporarily; the table refills under the same load, so nothing is confirmed and nothing is fixed.
- **Watch apiserver_request_total; scale the apiserver** — the API server is not in the data path of pod connections; its request rate is unrelated to kernel conntrack drops.
- **Check coredns_cache_hits_total; clear the CoreDNS cache** — DNS cache hits do not consume conntrack entries in the kernel stack where the drop is logged; the message names conntrack, not DNS.
