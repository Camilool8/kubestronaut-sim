**All traffic is allowed; restrictions only apply once a NetworkPolicy selects a pod** is correct: Kubernetes networking is default-allow — pods are non-isolated and accept traffic from any source until a NetworkPolicy selects them. Once a pod is selected by any policy, it only accepts traffic that some policy explicitly allows, which is why teams often start with a default-deny policy and add allowances on top.

Why the others are wrong:

- **All traffic is denied until a policy explicitly allows it** — this describes the posture *after* a default-deny NetworkPolicy is applied, not the out-of-the-box behavior of a cluster.
- **Only traffic within the same node is allowed** — the Kubernetes network model allows pod-to-pod communication across all nodes; node boundaries never restrict traffic by default.
- **Only traffic to pods with the same labels is allowed** — labels have no effect on connectivity by themselves; they only matter when a NetworkPolicy uses them in a selector.
