## Question

Dans un pod, vers quelle adresse pointe le nameserver de /etc/resolv.conf en configuration par défaut (dnsPolicy: ClusterFirst) ?

## Options

- Directement l'IP du pod CoreDNS
- Le ClusterIP du Service kube-dns
- 127.0.0.53 (systemd-resolved)
- Le resolv.conf du nœud, copié tel quel

## Solution

**Le ClusterIP du Service kube-dns** est la bonne réponse : Avec `ClusterFirst`, le kubelet injecte le ClusterIP du Service `kube-dns` (défini via `--cluster-dns`) comme nameserver, plus des search domains comme `<ns>.svc.cluster.local` et `ndots:5`.
