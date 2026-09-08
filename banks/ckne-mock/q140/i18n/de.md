## Question

CoreDNS geht direkt nach der Installation in CrashLoopBackOff und loggt "Loop ... detected". Typische Ursache auf Nodes mit systemd-resolved?

## Options

- Fehlendes RBAC für den CoreDNS-ServiceAccount
- Ein korruptes Image in der internen Registry
- Die resolv.conf des Nodes zeigt auf 127.0.0.53
- Zu viele Replikas

## Solution

**Die resolv.conf des Nodes zeigt auf 127.0.0.53** ist die richtige Antwort: CoreDNS forwardet an den lokalen Stub, der zurück an CoreDNS schickt — Endlosschleife, die das `loop`-Plugin erkennt. Fix: das Kubelet mit `--resolv-conf=/run/systemd/resolve/resolv.conf` auf die echte Datei zeigen lassen.
