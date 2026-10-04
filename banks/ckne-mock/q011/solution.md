**ClusterIP** is correct: `ClusterIP` is the default: a stable virtual IP, resolvable via internal DNS, with L4 balancing to the endpoints. NodePort opens a port on every node; LoadBalancer provisions an external LB; ExternalName is just a CNAME.

Why the others are wrong:

- **NodePort** — opens a port on every node's address on top of the ClusterIP — that is external exposure, the very thing the question rules out.
- **ExternalName** — creates only a CNAME to an outside name; there is no VIP and no balancing at all, kube-proxy never sees it.
- **LoadBalancer** — asks the cloud or a bare-metal controller for an external address; it includes a ClusterIP, but its purpose is to be reached from outside.
