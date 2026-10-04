**Policies are additive (allow-list)** is correct: Native NetworkPolicies only allow: selecting a pod isolates it, and what's allowed is the union of all policies. There is no explicit deny or precedence — and enforcement depends on the CNI (plain Flannel ignores policies). Cilium/Calico CRDs add deny and priority.

Why the others are wrong:

- **Policies require numeric priority ordering** — the native API has no priority field at all; every policy that selects a pod contributes to the union of what is allowed.
- **The last applied policy overrides earlier ones** — there is no ordering by application time; a new policy adds to the allowed set and never overrides an earlier one.
- **Policies work even without CNI support** — policies are only stored by the API server; without a CNI that implements them (kindnet, for example, does not) they are silently inert.
