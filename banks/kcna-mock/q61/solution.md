**Only traffic from Pods labeled `app: api`, on port 5432** is correct: this NetworkPolicy selects Pods labeled `app: db` (`spec.podSelector`) and, because it lists `Ingress` in `policyTypes`, becomes a default-deny for incoming traffic to those Pods except what the `ingress` rules explicitly allow. The one rule here permits traffic from Pods labeled `app: api`, and only on port 5432 — nothing else reaches `db` Pods once this policy exists, including traffic on other ports from `api` Pods or the same port from anything else.

Why the others are wrong:

- **All traffic to the db Pods, since no `from` block restricts the source IP range** — the `from` block here is a `podSelector`, which is exactly as restrictive as a CIDR block would be; the rule scopes the source by Pod labels rather than IP.
- **Traffic from any Pod in the cluster, but only on port 5432** — a NetworkPolicy with an `ingress` rule denies everything not explicitly matched; the `podSelector` under `from` narrows the source, it does not merely annotate it.
- **No traffic at all, because NetworkPolicy resources are ignored unless a CNI plugin's own CRD also exists** — a CNI that supports NetworkPolicy (as required for policies to have any effect at all) enforces the standard `networking.k8s.io/v1` resource directly; no separate CRD is needed for this core API to apply.
