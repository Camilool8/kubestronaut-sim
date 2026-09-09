## Question

¿Qué significa "kube-proxy replacement" en CNI como Cilium?

## Options

- Delegar la resolución de Services a CoreDNS con un plugin dedicado
- Ejecutar dos instancias de kube-proxy por nodo
- Sustituir la lógica de Services por programas eBPF, sin kube-proxy
- Utilizar un proxy HTTP en lugar de kube-proxy

## Solution

**Sustituir la lógica de Services por programas eBPF, sin kube-proxy** es la respuesta correcta: Cilium implementa ClusterIP/NodePort/LoadBalancer con eBPF (balanceo a nivel de socket y XDP), eliminando kube-proxy y las chains de iptables, lo que reduce la latencia y mejora la escalabilidad. Compruebe con `cilium status | grep KubeProxyReplacement`.
