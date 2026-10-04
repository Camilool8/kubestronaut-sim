**hostPort opens the port ONLY on the node where the pod runs** is correct: `hostPort` ties pod↔node (port collisions limit scheduling); NodePort is implemented by kube-proxy on every node. Confusing them causes "works on one node, fails on the others".

Why the others are wrong:

- **They are identical** — one is a pod-level port mapping done by the CNI portmap plugin, the other a Service implemented by kube-proxy on every node; they differ in scope, scheduling impact and load balancing.
- **NodePort only works in the cloud** — NodePort works on any cluster, bare metal included — it is a plain kube-proxy rule on each node's addresses.
- **hostPort is safer and balances better** — hostPort does no balancing at all (one pod behind one node port) and, by colliding on ports, constrains where pods can be scheduled.
