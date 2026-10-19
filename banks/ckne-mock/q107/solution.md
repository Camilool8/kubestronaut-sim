**Cluster scope, priority and Allow/Deny/Pass actions** is correct: ANP gives administrators non-overridable guardrails (e.g., "never allow egress to cloud metadata") and BANP sets the cluster default when no user policy decides. Order: ANP → NetworkPolicy → BANP.

Why the others are wrong:

- **A firewall for the internet only** — ANP applies to any traffic its subjects send or receive, cluster-internal included; it is not an edge firewall.
- **It replaces RBAC for network traffic** — RBAC controls access to the Kubernetes API; ANP controls packets between workloads — different planes, both still needed.
- **Nothing, it's just a NetworkPolicy rename** — the differences are structural: cluster-scoped, prioritised, with Deny and Pass actions the native API never had.
