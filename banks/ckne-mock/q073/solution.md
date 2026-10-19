**port is the Service's own port** is correct: The client hits `ClusterIP:port`; kube-proxy DNATs to `podIP:targetPort`; if the type exposes nodes, `nodePort` is the external port on each node. Confusing port with targetPort is a common cause of "connection refused".

Why the others are wrong:

- **They are synonyms** — each names a different hop: the client's port on the VIP, the pod's port, and the port opened on the node — a mismatch between the first two is a classic "refused".
- **Only nodePort is mandatory** — `nodePort` is only meaningful for NodePort/LoadBalancer Services and is auto-assigned if omitted; `port` is the one field every Service needs.
- **port belongs to the container, targetPort to the node, nodePort to the Service** — the roles are scrambled: `port` is the Service's, `targetPort` the container's, `nodePort` the node's.
