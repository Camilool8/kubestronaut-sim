**podSelector: {} with policyTypes: [Ingress, Egress] and no ingress/egress rules** is correct: Selecting everything and declaring both policyTypes with no rules = total default deny. The variant with `[{}]` allows everything (an empty rule matches any source/destination) — the classic exam trap. From there, each access is granted by additional policies.

Why the others are wrong:

- **Delete all Services** — Services are only VIPs; pods remain reachable by IP without them, and outbound traffic is untouched.
- **Only policyTypes: [Ingress] with podSelector: {}** — with only `Ingress` declared, egress is never evaluated and stays fully open.
- **podSelector: {} with ingress: [{}] and egress: [{}] declared** — empty rule items match everything, so that manifest allows all traffic in both directions.
