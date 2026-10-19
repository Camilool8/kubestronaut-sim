**Pod IPs are ephemeral and may arrive SNATed; use selectors** is correct: Policies between workloads should use identity (labels), not addresses. The documentation itself restricts ipBlock to cluster-external IPs — the double risk: rotating IPs and NAT on the path.

Why the others are wrong:

- **ipBlock expires in 24h and must be renewed** — policies have no expiry; the rule stays in force, it is the pod's address that moves out from under it.
- **A /32 CIDR is invalid in NetworkPolicy rules** — `/32` is a valid CIDR and is accepted by the API.
- **The frontend needs hostNetwork to be selectable** — hostNetwork would make the frontend use the node IP — even further from the address in the rule, and still not selectable by label.
