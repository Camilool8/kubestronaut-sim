**No addresses at all — the Service's selector must match ALL of a Pod's labels to include it, and none of the Pods carry `tier: frontend`** is correct: a Service's `spec.selector` is an implicit AND across every key it lists. A Pod is only added to the Service's Endpoints (and therefore ever receives traffic) if it carries every one of those labels with matching values. Since not one running Pod has `tier: frontend`, the Endpoints object exists but lists zero addresses, which is exactly what makes requests to the Service time out — there is nowhere for kube-proxy to route them.

Why the others are wrong:

- **All the `app: web` Pods, because the selector matches on `app: web` and treats `tier` as an optional filter** — Service selectors have no concept of an "optional" key; every listed label is mandatory for a Pod to be included.
- **All the `app: web` Pods, but only on port 8080 instead of port 80** — `targetPort` is where traffic is forwarded on the Pod, not a restriction on which Pods qualify; this scenario yields zero matching Pods regardless of port.
- **An error, because a Service's selector cannot list more than one label** — Kubernetes selectors routinely combine several labels; there is no such restriction, and the manifest above is syntactically and semantically valid.
