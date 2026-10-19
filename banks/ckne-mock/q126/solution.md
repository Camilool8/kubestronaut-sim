**It inherits the NODE's resolv.conf** is correct: Classic naming trap: `Default` means "inherit from the node", breaking Service resolution. The policy actually applied to pods by default is `ClusterFirst`.

Why the others are wrong:

- **It uses a fixed 8.8.8.8** — no dnsPolicy hard-codes a public resolver; the nameserver comes from the node's configuration, whatever it is.
- **It disables DNS entirely** — `None` is the policy that stops the kubelet from writing resolv.conf (you supply `dnsConfig`); `Default` still writes one, from the node.
- **It uses the cluster DNS, as the name suggests** — that is `ClusterFirst`, the policy pods actually get when none is specified — the misleading name is the point of the question.
