## Question

Was ist der schnellste Test, um DNS und Basis-Konnektivität eines neuen Clusters auf einmal zu validieren?

## Options

- ping 8.8.8.8 von Ihrem Rechner
- kubectl get nodes -o wide mit INTERNAL-IP und Version
- kubectl run test --rm -it --image=busybox:1.36 -- nslookup kubernetes.default
- kubectl top pods --containers über ganz kube-system

## Solution

**kubectl run test --rm -it --image=busybox:1.36 -- nslookup kubernetes.default** ist die richtige Antwort: Dieser Einzeiler erstellt einen Pod, löst `kubernetes.default` auf (testet resolv.conf, Search-Domains, CoreDNS und den kube-dns-Service) und räumt sich selbst weg. Fehler hier zeigen direkt aufs DNS-/CNI-Subsystem.
