**api.payments.svc.cluster.local** is correct: cluster DNS names for Services follow the pattern `<service>.<namespace>.svc.<cluster-domain>`. The Service is named `api` and lives in the `payments` namespace, so its fully qualified name is `api.payments.svc.cluster.local`, and any Pod in the cluster can resolve it regardless of its own namespace.

Why the others are wrong:

- **api.svc.payments.cluster.local** — this swaps the namespace and the `svc` label; the namespace always comes directly after the Service name, before `svc`.
- **payments.api.svc.cluster.local** — this reverses the Service name and the namespace; DNS names start with the Service name, not the namespace.
- **api.frontend.svc.cluster.local** — this uses the caller's namespace instead of the Service's namespace; the DNS name is built from where the Service lives, not from where the client Pod runs.
