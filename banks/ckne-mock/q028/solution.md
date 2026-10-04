**ServiceExport/ServiceImport** is correct: In the MCS API, exporting a Service with `ServiceExport` creates a `ServiceImport` in the other clusters, resolvable as `svc.ns.svc.clusterset.local`. Implementations: Cilium Cluster Mesh, Submariner, GKE MCS.

Why the others are wrong:

- **ExternalDNS, with external.local** — ExternalDNS publishes cluster records to public DNS providers (Route 53, Cloud DNS); it is not a multi-cluster discovery API and `external.local` is invented.
- **ClusterFederation v1, with federated.local** — Kubernetes Federation (kubefed) was a separate, since-archived project with its own API; the MCS API is the SIG Multicluster standard, with `clusterset.local`.
- **Shared NodePort, with nodes.local** — sharing NodePorts is an ad-hoc pattern, not an API, and `nodes.local` is not a domain Kubernetes serves.
