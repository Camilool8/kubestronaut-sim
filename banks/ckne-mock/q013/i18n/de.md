## Question

Was bedeutet "kube-proxy replacement" bei CNIs wie Cilium?

## Options

- Delegiert die Service-Auflösung an CoreDNS mit einem eigenen Plugin
- Zwei kube-proxy-Instanzen pro Node betreiben
- Ersetzt die Service-Logik durch eBPF-Programme, ohne kube-proxy
- Einen HTTP-Proxy statt kube-proxy verwenden

## Solution

**Ersetzt die Service-Logik durch eBPF-Programme, ohne kube-proxy** ist die richtige Antwort: Cilium implementiert ClusterIP/NodePort/LoadBalancer mit eBPF (Socket-LB und XDP) und eliminiert kube-proxy samt iptables-Chains — weniger Latenz, mehr Skalierung. Prüfen mit `cilium status | grep KubeProxyReplacement`.
