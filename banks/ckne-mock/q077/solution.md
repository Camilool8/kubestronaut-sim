**A selector-less Service + a manual EndpointSlice with the external IPs** is correct: A Service without a `selector` generates no automatic endpoints; you create the `EndpointSlice` (with the kubernetes.io/service-name label) manually with the external IPs. Unlike ExternalName (CNAME), here you get a real VIP and balancing.

Why the others are wrong:

- **Installing the database in-cluster as a StatefulSet** — moving the database into the cluster changes the system; the question is how to address an existing external one through a cluster Service.
- **Impossible without rewriting kube-proxy** — kube-proxy already handles the case: it programs DNAT to whatever addresses the EndpointSlice lists, in-cluster or not.
- **Use hostNetwork** — hostNetwork changes which network namespace a pod runs in; it neither creates a Service nor makes an external host resolvable by a cluster name.
