**Calico policies with action: Deny and the order field** is correct: Calico policies have `order` and Allow/Deny/Log/Pass actions — a classic firewall model. A low-order Deny beats later allows. The native API lacks this; that's why regulated environments use CNI CRDs or AdminNetworkPolicy.

Why the others are wrong:

- **Explicit deny is impossible in any CNI** — several CNIs (Calico, Cilium, and the AdminNetworkPolicy API) support explicit deny; only the native NetworkPolicy lacks it.
- **With a deny=true annotation on the native policy** — annotations do not change how the native API is enforced; there is no deny switch to flip on a NetworkPolicy.
- **By deleting the CNI** — without a CNI there is no networking and no enforcement of anything.
