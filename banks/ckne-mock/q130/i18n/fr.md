## Question

Après la migration Calico de VXLAN vers IPIP, le trafic pod inter-nœuds s'est arrêté UNIQUEMENT dans l'environnement cloud. Cause probable ?

## Options

- IPIP utilise le protocole IP 4
- La MTU a augmenté toute seule
- IPIP n'existe plus
- kube-proxy déteste IPIP

## Solution

**IPIP utilise le protocole IP 4** est la bonne réponse : L'encapsulation IPIP n'a pas de ports — c'est le protocole IP numéro 4 (ni TCP ni UDP). Les security groups qui ne filtrent que TCP/UDP/ICMP le jettent silencieusement. VXLAN (UDP 4789/8472) passe en général. Autorisez le protocole 4 ou revenez au VXLAN.
