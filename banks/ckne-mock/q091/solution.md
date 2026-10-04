**Configure the ip-masq-agent** is correct: `ip-masq-agent` controls masquerading per destination: CIDRs listed in nonMasqueradeCIDRs leave with the pod's original IP. CNIs have equivalents (Cilium ipMasqAgent, Calico natOutgoing per IPPool).

Why the others are wrong:

- **Use hostNetwork on all pods** — hostNetwork makes pods use the node IP outright; the goal is for the pod's own IP to be seen, not lost entirely.
- **Turn off kube-proxy** — kube-proxy handles Service DNAT; egress masquerade is applied by the CNI or ip-masq-agent, so removing kube-proxy breaks Services and changes nothing about SNAT.
- **Impossible without a service mesh** — a mesh proxies at L7 and would itself originate connections; the SNAT decision is a node-level NAT rule that CNIs and ip-masq-agent already make configurable.
