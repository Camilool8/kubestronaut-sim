## Question

Pour chiffrer de façon transparente tout le trafic pod-à-pod entre nœuds, sans toucher aux applications, quelle fonctionnalité du CNI ?

## Options

- kube-proxy en mode IPVS
- NetworkPolicy avec un champ encrypt: true
- Chiffrement WireGuard ou IPsec dans le CNI
- TLS dans CoreDNS

## Solution

**Chiffrement WireGuard ou IPsec dans le CNI** est la bonne réponse : Cilium et Calico offrent un chiffrement transparent nœud-à-nœud : WireGuard (clés automatiques par nœud) ou IPsec (rotation via secret). Il couvre le trafic « sur le fil » entre nœuds — complémentaire du mTLS applicatif.
