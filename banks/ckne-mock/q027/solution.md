**Returns a CNAME to an external DNS name, no proxy, no endpoints** is correct: `ExternalName` is purely DNS: queries return a CNAME to `spec.externalName`. There is no VIP, no kube-proxy, no balancing — useful for abstracting external services behind internal names.

Why the others are wrong:

- **Creates a NodePort with a custom name** — NodePort is a different type: it opens a port on every node and forwards to endpoints; ExternalName opens nothing.
- **It requires a cloud-provisioned LoadBalancer to work** — no external load balancer is involved — the answer is a CNAME from CoreDNS and the client connects on its own.
- **Assigns a fixed external IP to the pod** — pods never get a fixed external address from a Service; ExternalName does not even reference pods.
