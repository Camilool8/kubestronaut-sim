**A/AAAA records with the IPs of each ready pod matching the selector** is correct: Headless Services have no VIP: CoreDNS answers with the pod IPs. In StatefulSets, each pod also gets a stable record `pod.service.ns.svc.cluster.local` — essential for databases and identity-based discovery.

Why the others are wrong:

- **A CNAME record to the kube-apiserver** — no Service record is a CNAME to the API server; only the `kubernetes.default` Service points there, and as an A record to its ClusterIP.
- **The Service's ClusterIP** — a headless Service has `clusterIP: None` — there is no VIP to return; that is the definition of headless.
- **Always NXDOMAIN** — NXDOMAIN would mean the name does not exist; it does, and it resolves to the endpoints as long as any pod is ready.
