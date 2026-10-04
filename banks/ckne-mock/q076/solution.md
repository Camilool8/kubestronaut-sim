**SRV in the form _port._proto.service.ns.svc.cluster.local** is correct: For each named port, an SRV `_http._tcp.my-svc.default.svc.cluster.local` is created returning port and host. Applications can discover the port dynamically via SRV, without hardcoding.

Why the others are wrong:

- **TXT records with the Service YAML** — Kubernetes publishes no TXT records for Services, and never serialises manifests into DNS.
- **MX records for each named port of the Service** — MX records designate mail exchangers; they have no meaning for Service ports.
- **NS records per namespace** — the cluster zone is served as one zone by CoreDNS; namespaces are labels within names, not delegated sub-zones.
