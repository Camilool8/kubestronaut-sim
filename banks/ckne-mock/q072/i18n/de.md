## Question

Welches ist das neueste kube-proxy-Backend, geschaffen als Ersatz des iptables-Modus mit besserer Performance und modernerer Kernel-API?

## Options

- socketd
- ebtables
- nftables
- tc

## Solution

**nftables** ist die richtige Antwort: Der `nftables`-Modus (GA in Kubernetes 1.33) nutzt die Nachfolger-API von iptables, mit effizienteren Regel-Updates und besserer Performance bei vielen Services. eBPF (Cilium) bleibt die Alternative außerhalb von kube-proxy.
