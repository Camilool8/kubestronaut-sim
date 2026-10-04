**ClusterIPs change on every Service recreation** is correct: The IP is dynamically allocated from the service range at creation (unless spec.clusterIP pins it). The stable Kubernetes contract is the NAME. Application-side DNS caching (JVM!) deserves attention after recreation.

Why the others are wrong:

- **The old IP comes back in 24h** — released ClusterIPs return to the pool and can be handed to any new Service at any time; nothing brings a particular address back.
- **They should use the pod IP directly** — pod IPs are even less stable than ClusterIPs, changing on every restart; the fix is to resolve the name, not to go lower.
- **Services cannot be recreated** — recreating a Service is perfectly allowed; what is not guaranteed is the address that comes with it.
