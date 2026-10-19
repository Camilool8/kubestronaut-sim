**The node's IPAM pool is exhausted** is correct: Each node has a finite range (default /24 podCIDR ≈ 254 IPs vs. max-pods 110). Crashes can leave orphaned leases in the IPAM state (e.g., `/var/lib/cni/networks/<net>`). Remove IP files without a matching container or resize the range.

Why the others are wrong:

- **The cluster DNS is down** — DNS is consulted only after a pod has an address and is running; it plays no part in CNI ADD, and its failure produces resolution errors, not this message.
- **The kubelet is out of memory** — kubelet memory pressure evicts pods or slows the node; it would not phrase itself as an IPAM range error, which comes verbatim from the host-local plugin.
- **The apiserver is throttling requests** — API throttling shows up as client-side rate-limit messages and slow object updates; address allocation happens on the node, without an API call.
