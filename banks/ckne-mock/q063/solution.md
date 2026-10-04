**Multus + SR-IOV CNI + device plugin, handing NIC VFs to the pod** is correct: SR-IOV splits the physical NIC into Virtual Functions (VFs) handed directly to the pod (bypassing the host stack), with the device plugin managing allocation and Multus attaching the interface — standard in telco/NFV and low-latency workloads.

Why the others are wrong:

- **Two kube-proxy replicas** — kube-proxy programs Service rules on each node; it is not in the pod's data path for a raw NIC and has no notion of replicas per node.
- **Raising CPU requests** — more CPU does not remove the host stack, bridge and veth hops from the path — the latency comes from the path, not from cycles.
- **hostPort + NodePort combined on the same physical port** — both only expose ports through the node's regular network stack; they add nothing that bypasses it.
