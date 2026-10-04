**Including NOT-ready pods in DNS/endpoints too** is correct: Normally only ready pods enter DNS/endpoints — but a forming etcd/Cassandra cluster needs members to resolve each other BEFORE they're ready (chicken-and-egg). This field, common on StatefulSet headless Services, solves it.

Why the others are wrong:

- **Ignoring the livenessProbe** — probes are not affected: liveness still restarts the container, readiness is still evaluated — only the publication rule for endpoints changes.
- **Publishing the Service on the internet via LoadBalancer** — exposure to the internet is the LoadBalancer type's job; this boolean concerns which pods appear in endpoints, not where the Service is reachable from.
- **Duplicating the endpoints** — each pod appears once; the field widens the set to include not-ready pods, it does not duplicate entries.
