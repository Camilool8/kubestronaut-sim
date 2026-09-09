## Question

Quel est le backend kube-proxy le plus récent, créé pour remplacer le mode iptables avec de meilleures performances et une API kernel moderne ?

## Options

- socketd
- ebtables
- nftables
- tc

## Solution

**nftables** est la bonne réponse : Le mode `nftables` (GA dans Kubernetes 1.33) utilise l'API successeur d'iptables, avec des mises à jour de règles plus efficaces et de meilleures performances quand il y a beaucoup de Services. eBPF (Cilium) reste l'alternative hors kube-proxy.
