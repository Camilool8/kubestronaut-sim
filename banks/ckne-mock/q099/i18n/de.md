## Question

In einer Istio-Multi-Cluster-Topologie mit getrennten Netzen (kein direktes Pod-zu-Pod) — welche Komponente lässt Service-Traffic zwischen den Clustern fließen?

## Options

- Ein NodePort pro Service, in allen Clustern geöffnet
- Ein dediziertes East-West-Gateway exponiert Services zwischen Clustern (mTLS)
- Dauerhaftes kubectl port-forward
- VPN auf den Entwickler-Laptops

## Solution

**Ein dediziertes East-West-Gateway exponiert Services zwischen Clustern (mTLS)** ist die richtige Antwort: Wenn sich Pods verschiedener Cluster nicht direkt erreichen, routet Istio den Cross-Cluster-Traffic über East-West-Gateways (dedizierter LoadBalancer) — mit durchgehendem mTLS und einheitlicher Endpoint-Discovery über Netze hinweg.
