**The ClusterIP of the kube-dns Service** is correct: With `ClusterFirst`, the kubelet injects the ClusterIP of the `kube-dns` Service (set via `--cluster-dns`) as nameserver, plus search domains like `<ns>.svc.cluster.local` and `ndots:5`.

Why the others are wrong:

- **The CoreDNS pod IP directly** — pod IPs change on every restart; pointing clients at them would break resolution each time CoreDNS is rescheduled — the stable VIP is the whole point of the Service.
- **127.0.0.53 (systemd-resolved)** — that is systemd-resolved's stub listener on a host; a pod runs no resolved instance, so the address would answer nothing.
- **The node's resolv.conf, copied unchanged** — copying the node's file is exactly what `dnsPolicy: Default` does, and it loses the cluster search domains — `ClusterFirst` is the opposite.
