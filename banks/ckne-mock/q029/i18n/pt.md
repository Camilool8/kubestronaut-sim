## Question

Em um cluster bare-metal sem cloud provider, Services LoadBalancer ficam em pending. Qual solução resolve, e quais seus dois modos de operação?

## Options

- Reiniciar o kube-proxy — modos iptables ou ipvs
- CoreDNS — modos forward ou rewrite
- MetalLB — modo L2 (ARP/NDP) ou modo BGP
- kubeadm — modos init ou join

## Solution

**MetalLB — modo L2 (ARP/NDP) ou modo BGP** é a resposta correta: O MetalLB aloca IPs de um pool e os anuncia: em **L2**, um nó responde ARP pelo VIP; em **BGP**, os nós anunciam o VIP aos roteadores, com ECMP. Cilium também oferece BGP Control Plane e LB-IPAM nativos.
