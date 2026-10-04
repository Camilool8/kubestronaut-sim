**A ReferenceGrant in the Service's namespace authorizing the route** is correct: Cross-namespace references are denied by default (protection against traffic "hijacking"). The destination namespace owner publishes a `ReferenceGrant` declaring from (kind/namespace) and to (kind/name) — only then does the route resolve.

Why the others are wrong:

- **Recreate the Service as NodePort** — the Service type is irrelevant; the block is an authorization rule, not a reachability one.
- **Nothing, cross-namespace references are allowed by default** — cross-namespace backend references are denied by default, precisely so that a route in one namespace cannot capture another namespace's traffic.
- **Put the Gateway in kube-system** — the Gateway's namespace is not what the check looks at; the grant is about the route's namespace being allowed into the Service's.
