**It shares the node's network namespace and uses the node's IP** is correct: With `hostNetwork: true`, the pod gets no netns of its own: it uses the node's IP and interfaces. Open ports compete with host processes, and podSelector-based NetworkPolicies usually don't apply as expected.

Why the others are wrong:

- **Loses external connectivity** — the opposite — it has the node's own connectivity, including interfaces the CNI never exposes to ordinary pods.
- **Gets an IP from the pod CIDR as usual** — no pod netns means no CNI ADD and no pod-CIDR address; `status.podIP` simply reports the node's IP.
- **Only talks to pods in the same namespace** — Kubernetes namespaces are an API grouping, not a network boundary; reachability is governed by routing and NetworkPolicy, and a hostNetwork pod is reachable like the node itself.
