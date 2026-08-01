**LoadBalancer** is correct: on a managed cloud cluster, setting `spec.type: LoadBalancer` asks the cloud provider's integration to provision an external load balancer with a public IP address that forwards traffic to the Service. This is the standard way to expose a single Service directly to the internet on cloud platforms.

Why the others are wrong:

- **ClusterIP** — this type only assigns an internal virtual IP reachable from inside the cluster, so external clients on the internet cannot reach it at all.
- **NodePort** — this opens a static port on every node's IP, but it does not provision a cloud load balancer or an external IP by itself; clients would need to know individual node addresses.
- **ExternalName** — this type creates a DNS CNAME record pointing at an external hostname; it routes cluster traffic outward and cannot expose an application to the internet.
