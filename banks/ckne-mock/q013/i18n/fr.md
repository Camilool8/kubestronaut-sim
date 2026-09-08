## Question

Que signifie « kube-proxy replacement » chez les CNI comme Cilium ?

## Options

- Déléguer la résolution des Services à CoreDNS avec un plugin dédié
- Faire tourner deux instances de kube-proxy par nœud
- Remplacer la logique des Services par des programmes eBPF, sans kube-proxy
- Utiliser un proxy HTTP à la place de kube-proxy

## Solution

**Remplacer la logique des Services par des programmes eBPF, sans kube-proxy** est la bonne réponse : Cilium implémente ClusterIP/NodePort/LoadBalancer en eBPF (LB au niveau socket et XDP), éliminant kube-proxy et les chaînes iptables — moins de latence, meilleure échelle. Vérifiez avec `cilium status | grep KubeProxyReplacement`.
