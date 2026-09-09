## Question

Auf welche Adresse zeigt der nameserver in /etc/resolv.conf eines Pods in der Standardkonfiguration (dnsPolicy: ClusterFirst)?

## Options

- Direkt auf die CoreDNS-Pod-IP
- Auf den ClusterIP des kube-dns Service
- Auf 127.0.0.53 (systemd-resolved)
- Auf die unverändert kopierte resolv.conf des Nodes

## Solution

**Auf den ClusterIP des kube-dns Service** ist die richtige Antwort: Mit `ClusterFirst` injiziert das Kubelet den ClusterIP des `kube-dns`-Service (via `--cluster-dns`) als nameserver, plus Search-Domains wie `<ns>.svc.cluster.local` und `ndots:5`.
