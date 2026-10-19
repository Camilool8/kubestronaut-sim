**Add a server block to the Corefile** is correct: The Corefile (ConfigMap `coredns` in kube-system) accepts multiple server blocks. A dedicated block with the `forward` plugin creates a stub domain. Other useful plugins: `rewrite`, `hosts`, `log`.

Why the others are wrong:

- **Edit /etc/hosts on every node** — pods do not read the nodes' `/etc/hosts`, and hosts files hold names, not zone delegations — they cannot send a whole domain to another server.
- **Create an ExternalName Service named corp.example.com** — ExternalName creates a single CNAME for one Service name; it cannot delegate every name under `corp.example.com` to another resolver.
- **Add the zone to the kubelet with --cluster-domain** — `--cluster-domain` sets the cluster's own suffix (`cluster.local`); it does not forward foreign zones anywhere.
