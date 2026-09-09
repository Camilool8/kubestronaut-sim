## Question

O que significa "kube-proxy replacement" em CNIs como o Cilium?

## Options

- Delegar a resolução dos Services ao CoreDNS com um plugin dedicado
- Rodar duas instâncias de kube-proxy por nó
- Substituir a lógica de Services por programas eBPF, sem kube-proxy
- Usar um proxy HTTP no lugar do kube-proxy

## Solution

**Substituir a lógica de Services por programas eBPF, sem kube-proxy** é a resposta correta: O Cilium implementa ClusterIP/NodePort/LoadBalancer com eBPF (socket-level LB e XDP), eliminando o kube-proxy e as chains iptables — reduzindo latência e melhorando escala. Verifique com `cilium status | grep KubeProxyReplacement`.
