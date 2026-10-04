**The search and ndots entries in the pod's /etc/resolv.conf** is correct: Short names depend on the `search` domains (e.g., `default.svc.cluster.local svc.cluster.local`) and `ndots:5`. If dnsPolicy/dnsConfig was changed, or the pod is in another namespace, the short name doesn't expand to the right FQDN.

Why the others are wrong:

- **The node's kernel version** — name expansion is done by the resolver library reading `/etc/resolv.conf`; no kernel version changes how a short name is completed.
- **Whether the pod has hostNetwork enabled in its spec** — with hostNetwork the pod would have lost cluster DNS entirely, so the FQDN would fail too — yet it works, which rules the setting out as the first check.
- **Whether kube-proxy is in IPVS or iptables mode** — kube-proxy forwards packets to the DNS Service; the FQDN query reaching CoreDNS proves that path works, so the proxy mode is not what differs.
