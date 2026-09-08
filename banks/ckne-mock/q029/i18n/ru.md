## Question

В bare-metal кластере без cloud provider Services типа LoadBalancer остаются pending. Какое решение исправляет это и какие два режима оно поддерживает?

## Options

- Перезапуск kube-proxy — режимы iptables или ipvs
- CoreDNS — режимы forward или rewrite
- MetalLB — режим L2 (ARP/NDP) или режим BGP
- kubeadm — режимы init или join

## Solution

**MetalLB — режим L2 (ARP/NDP) или режим BGP** — правильный ответ: MetalLB выделяет IP из pool и объявляет их: в режиме **L2** один узел отвечает ARP за VIP; в режиме **BGP** узлы объявляют VIP маршрутизаторам с ECMP. Cilium также предоставляет встроенные BGP Control Plane и LB-IPAM.
