## Question

En un cluster bare-metal sin cloud provider, los Services LoadBalancer permanecen pending. ¿Qué solución lo corrige y cuáles son sus dos modos de operación?

## Options

- Reiniciar kube-proxy: modos iptables o ipvs
- CoreDNS: modos forward o rewrite
- MetalLB: modo L2 (ARP/NDP) o modo BGP
- kubeadm: modos init o join

## Solution

**MetalLB: modo L2 (ARP/NDP) o modo BGP** es la respuesta correcta: MetalLB asigna IP de un pool y las anuncia: en **L2**, un nodo responde ARP por el VIP; en **BGP**, los nodos anuncian el VIP a los routers mediante ECMP. Cilium también ofrece BGP Control Plane y LB-IPAM nativos.
