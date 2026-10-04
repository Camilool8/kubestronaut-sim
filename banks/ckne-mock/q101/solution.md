**Everything allowed between any pods (allow-any-any)** is correct: The Kubernetes network model is open by default: with no policies, there is no isolation at all. Hence the best practice of starting with per-namespace default-deny and explicitly allowing what's needed.

Why the others are wrong:

- **Only traffic within the same namespace is allowed** — namespaces carry no network isolation by themselves; pods in different namespaces reach each other freely until a policy says otherwise.
- **Only TCP traffic is allowed** — no protocol filtering exists without policies; UDP, SCTP and ICMP flow just like TCP.
- **Everything blocked by default** — default deny is a posture you must create with a policy; out of the box nothing is blocked.
