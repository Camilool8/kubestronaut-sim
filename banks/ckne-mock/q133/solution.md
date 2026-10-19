**CNI DEL; without it, IP leases are orphaned in IPAM** is correct: The runtime calls `CNI_COMMAND=DEL` on removal. Crashes can skip that step — the origin of ghost leases in `/var/lib/cni/networks` and the "no IP addresses available" error weeks later.

Why the others are wrong:

- **CNI FLUSH; etcd removes the IP** — there is no FLUSH verb in the CNI spec, and etcd stores no IPAM state for host-local allocations — they live on the node's disk.
- **None; the kernel always cleans everything itself** — the kernel discards the netns when its last process dies, but it knows nothing about the plugin's lease files, which persist until DEL removes them.
- **CNI REMOVE; nothing happens** — the verb is DEL, and skipping it has a real cost: the address stays marked as in use.
