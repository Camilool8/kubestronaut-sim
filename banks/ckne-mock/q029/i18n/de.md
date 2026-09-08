## Question

Auf Bare-Metal ohne Cloud-Provider bleiben LoadBalancer-Services pending. Welche Lösung behebt das, und was sind ihre zwei Betriebsmodi?

## Options

- kube-proxy neu starten — Modi iptables oder ipvs
- CoreDNS — Modi forward oder rewrite
- MetalLB — L2-Modus (ARP/NDP) oder BGP-Modus
- kubeadm — Modi init oder join

## Solution

**MetalLB — L2-Modus (ARP/NDP) oder BGP-Modus** ist die richtige Antwort: MetalLB vergibt IPs aus einem Pool und announct sie: Im **L2**-Modus beantwortet ein Node ARP für den VIP; im **BGP**-Modus announcen die Nodes den VIP an die Router, mit ECMP. Cilium bietet zusätzlich einen nativen BGP Control Plane und LB-IPAM.
