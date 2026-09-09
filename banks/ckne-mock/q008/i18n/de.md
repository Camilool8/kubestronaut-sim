## Question

`dig app.default.svc.cluster.local` funktioniert im Pod, `dig app` schlägt fehl. Was prüfen wir zuerst?

## Options

- Die Kernel-Version des Nodes
- Die Einträge search und ndots in der /etc/resolv.conf des Pods
- Ob der Pod hostNetwork im spec aktiviert hat
- Ob kube-proxy im IPVS-Modus läuft ist

## Solution

**Die Einträge search und ndots in der /etc/resolv.conf des Pods** ist die richtige Antwort: Kurznamen hängen an den `search`-Domains (z. B. `default.svc.cluster.local svc.cluster.local`) und `ndots:5`. Wurde dnsPolicy/dnsConfig geändert oder liegt der Pod in einem anderen Namespace, expandiert der Kurzname nicht zum richtigen FQDN.
