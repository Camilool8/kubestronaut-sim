**The CNI MTU minus the tunnel overhead (e.g., 1450)** is correct: The VXLAN header consumes ~50 bytes; if the pod sends 1500-byte frames, the encapsulated packet exceeds the physical MTU and gets dropped. Set the CNI MTU (the `mtu` field/auto-detection) to 1450 or enable jumbo frames (9000) on the physical network.

Why the others are wrong:

- **Reduce the replica count** — the number of pods has no bearing on the size of a frame; the problem is per-packet, not per-replica.
- **Raise the pod MTU to 9000** — raising the pod MTU makes the encapsulated packet even larger than the physical 1500 it already exceeds — the opposite of the fix, unless the physical network is raised first.
- **Disable TCP and use only UDP in the pods** — UDP datagrams fragment or drop just like TCP segments; the transport protocol does not change the tunnel overhead.
