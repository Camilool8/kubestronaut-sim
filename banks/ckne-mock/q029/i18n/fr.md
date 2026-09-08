## Question

Sur un cluster bare-metal sans cloud provider, les Services LoadBalancer restent pending. Quelle solution corrige cela, et quels sont ses deux modes ?

## Options

- Redémarrer kube-proxy — modes iptables ou ipvs
- CoreDNS — modes forward ou rewrite
- MetalLB — mode L2 (ARP/NDP) ou mode BGP
- kubeadm — modes init ou join

## Solution

**MetalLB — mode L2 (ARP/NDP) ou mode BGP** est la bonne réponse : MetalLB alloue des IPs d'un pool et les annonce : en **L2**, un nœud répond à l'ARP du VIP ; en **BGP**, les nœuds annoncent le VIP aux routeurs, avec ECMP. Cilium offre aussi un BGP Control Plane natif et le LB-IPAM.
